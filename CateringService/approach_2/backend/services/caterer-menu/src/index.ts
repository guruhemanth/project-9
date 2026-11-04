import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import { pgPool } from './db';
import {
  catererOnboardingSchema,
  packageSchema,
  blackoutDateSchema,
  CatererStatus,
  validateEnv,
  createDbEnvSchema,
  buildCorsOptions,
  registerCentralizedErrorHandler,
  loggerRedactionConfig,
  getAuthenticatedUser,
} from '@caterconnect/shared';

export function buildCatererServer() {
  const env = validateEnv(createDbEnvSchema(), process.env);
  const server = Fastify({
    logger: {
      redact: loggerRedactionConfig,
    },
    bodyLimit: 1048576,
    connectionTimeout: 10000,
    requestTimeout: 15000,
  });

  registerCentralizedErrorHandler(server, 'caterer-menu-service');

  server.addHook('onClose', async () => {
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
  });

  server.register(fastifyHelmet, { contentSecurityPolicy: false });
  server.register(fastifyCors, buildCorsOptions(env.ALLOWED_ORIGINS, env.NODE_ENV));

  // Helper to assert caterer ownership or admin role
  async function assertCatererOwner(catererId: string, actorId: string, actorRole: string): Promise<boolean> {
    if (actorRole === 'admin') return true;
    const res = await pgPool.query('SELECT owner_id FROM caterer_svc.caterers WHERE id = $1', [catererId]);
    if (res.rows.length === 0) return false;
    return res.rows[0].owner_id === actorId;
  }

  // Health & Readiness checks
  server.get('/health', async () => ({ status: 'ok', service: 'caterer-menu-service' }));
  server.get('/ready', async (_req, reply) => {
    try {
      await pgPool.query('SELECT 1');
      return { status: 'ready', database: 'connected', service: 'caterer-menu-service' };
    } catch (err: any) {
      return reply.status(503).send({ status: 'not_ready', database: 'disconnected', service: 'caterer-menu-service' });
    }
  });

  // List approved caterers with optional filters (cuisine, min/max budget, city, state, search)
  server.get('/api/caterers', async (req, reply) => {
    const query = req.query as {
      cuisine?: string;
      maxPrice?: string;
      city?: string;
      state?: string;
      search?: string;
    };

    let sql = `
      SELECT 
        c.id, c.business_name, c.description, c.city, c.state, c.pincode, c.address, c.service_areas,
        c.cuisines, c.fssai_number, c.gst_number, c.status, c.avg_rating,
        c.review_count, c.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', p.id,
              'name', p.name,
              'description', p.description,
              'pricePerPlatePaise', p.price_per_plate_paise,
              'minGuests', p.min_guests,
              'maxGuests', p.max_guests
            )
          ) FILTER (WHERE p.id IS NOT NULL), '[]'
        ) as packages
      FROM caterer_svc.caterers c
      LEFT JOIN caterer_svc.packages p ON c.id = p.caterer_id
      WHERE c.status = 'approved'
    `;

    const params: any[] = [];

    if (query.cuisine && query.cuisine !== 'all') {
      params.push(query.cuisine);
      sql += ` AND $${params.length} = ANY(c.cuisines)`;
    }

    if (query.city && query.city.toLowerCase() !== 'all' && query.city.toLowerCase() !== 'all india') {
      params.push(query.city.trim());
      sql += ` AND (
        LOWER(c.city) = LOWER($${params.length})
        OR LOWER(c.state) = LOWER($${params.length})
        OR EXISTS (
          SELECT 1 FROM unnest(c.service_areas) area
          WHERE LOWER(area) LIKE '%' || LOWER($${params.length}) || '%'
        )
      )`;
    }

    if (query.search && query.search.trim()) {
      params.push(`%${query.search.trim().toLowerCase()}%`);
      sql += ` AND (
        LOWER(c.business_name) LIKE $${params.length}
        OR LOWER(COALESCE(c.description, '')) LIKE $${params.length}
        OR LOWER(c.city) LIKE $${params.length}
      )`;
    }

    sql += ` GROUP BY c.id ORDER BY c.avg_rating DESC, c.created_at DESC`;

    const result = await pgPool.query(sql, params);

    const caterers = result.rows.map((row) => ({
      id: row.id,
      businessName: row.business_name,
      description: row.description,
      city: row.city,
      state: row.state,
      pincode: row.pincode,
      address: row.address,
      serviceAreas: row.service_areas,
      cuisines: row.cuisines,
      fssaiNumber: row.fssai_number,
      gstNumber: row.gst_number,
      status: row.status,
      avgRating: parseFloat(row.avg_rating || '0'),
      reviewCount: row.review_count,
      packages: row.packages,
      createdAt: row.created_at,
    }));

    return reply.send({ caterers });
  });

  // Get distinct active operating cities
  server.get('/api/caterers/cities', async (req, reply) => {
    try {
      const result = await pgPool.query(`
        SELECT DISTINCT city, state, count(*)::int as count
        FROM caterer_svc.caterers
        WHERE status = 'approved'
        GROUP BY city, state
        ORDER BY count DESC, city ASC
      `);
      return reply.send({ cities: result.rows });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to retrieve active cities' });
    }
  });

  // Get single caterer detail by ID with packages and menu items
  server.get('/api/caterers/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const catererRes = await pgPool.query(
      'SELECT * FROM caterer_svc.caterers WHERE id = $1 LIMIT 1',
      [id]
    );

    if (catererRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Caterer not found' });
    }

    const c = catererRes.rows[0];

    // Only allow public viewing if approved, unless viewed by owner or admin
    if (c.status !== 'approved') {
      const authUser = getAuthenticatedUser(req);
      const isOwner = authUser && (authUser.userId === c.owner_id || authUser.role === 'admin');
      if (!isOwner) {
        return reply.status(404).send({ error: 'Caterer not found' });
      }
    }

    const packagesRes = await pgPool.query(
      `SELECT p.id, p.name, p.description, p.price_per_plate_paise, p.min_guests, p.max_guests,
        COALESCE(
          json_agg(
            json_build_object(
              'id', pi.id,
              'name', pi.name,
              'category', pi.category
            )
          ) FILTER (WHERE pi.id IS NOT NULL), '[]'
        ) as items
       FROM caterer_svc.packages p
       LEFT JOIN caterer_svc.package_items pi ON p.id = pi.package_id
       WHERE p.caterer_id = $1
       GROUP BY p.id, p.name, p.description, p.price_per_plate_paise, p.min_guests, p.max_guests
       ORDER BY p.price_per_plate_paise ASC`,
      [id]
    );

    const packages = packagesRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      pricePerPlatePaise: row.price_per_plate_paise,
      minGuests: row.min_guests,
      maxGuests: row.max_guests,
      items: row.items,
    }));

    return reply.send({
      caterer: {
        id: c.id,
        businessName: c.business_name,
        description: c.description,
        city: c.city,
        state: c.state,
        pincode: c.pincode,
        address: c.address,
        serviceAreas: c.service_areas,
        cuisines: c.cuisines,
        fssaiNumber: c.fssai_number,
        gstNumber: c.gst_number,
        status: c.status,
        avgRating: parseFloat(c.avg_rating || '0'),
        reviewCount: c.review_count,
        packages,
        createdAt: c.created_at,
      },
    });
  });

  // Caterer Onboarding (Create caterer profile, starts as 'pending')
  server.post('/api/caterers/onboard', async (req, reply) => {
    try {
      const parseResult = catererOnboardingSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'ValidationError',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const data = parseResult.data;
      const ownerId = authUser.userId;

      const insertRes = await pgPool.query(
        `INSERT INTO caterer_svc.caterers 
         (owner_id, business_name, description, city, state, pincode, address, service_areas, cuisines, fssai_number, gst_number, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
         RETURNING *`,
        [
          ownerId,
          data.businessName,
          data.description || '',
          data.city || 'Tirupati',
          data.state || 'Andhra Pradesh',
          data.pincode || null,
          data.address || null,
          data.serviceAreas || [],
          data.cuisines,
          data.fssaiNumber,
          data.gstNumber || null,
        ]
      );

      const c = insertRes.rows[0];
      return reply.status(201).send({
        message: 'Caterer profile submitted for verification',
        caterer: {
          id: c.id,
          ownerId: c.owner_id,
          businessName: c.business_name,
          status: c.status,
          fssaiNumber: c.fssai_number,
        },
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to onboard caterer' });
    }
  });

  // Admin status update (approve, reject, suspend) - STRICT ADMIN GUARD
  server.patch('/api/caterers/:id/status', async (req, reply) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser || authUser.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden: Admin access required' });
    }

    const { id } = req.params as { id: string };
    const { status, rejectionReason } = (req.body as any) || {};

    if (!['pending', 'approved', 'rejected', 'suspended'].includes(status)) {
      return reply.status(400).send({ error: 'Invalid caterer status' });
    }

    if (status === 'rejected' && !rejectionReason) {
      return reply.status(400).send({ error: 'Rejection reason is required when rejecting a caterer' });
    }

    const updateRes = await pgPool.query(
      `UPDATE caterer_svc.caterers
       SET status = $1, rejection_reason = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, status === 'rejected' ? rejectionReason : null, id]
    );

    if (updateRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Caterer not found' });
    }

    return reply.send({
      caterer: {
        id: updateRes.rows[0].id,
        status: updateRes.rows[0].status,
        rejectionReason: updateRes.rows[0].rejection_reason,
      },
    });
  });

  // Add menu package for caterer - OWNERSHIP GUARD
  server.post('/api/caterers/:id/packages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const authUser = getAuthenticatedUser(req);
    if (!authUser) {
      return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
    }

    const isOwner = await assertCatererOwner(id, authUser.userId, authUser.role);
    if (!isOwner) {
      return reply.status(403).send({ error: 'Forbidden: You do not own this caterer business' });
    }

    const parseResult = packageSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'ValidationError',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const data = parseResult.data;

    const res = await pgPool.query(
      `INSERT INTO caterer_svc.packages (caterer_id, name, description, price_per_plate_paise, min_guests, max_guests)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, data.name, data.description || '', data.pricePerPlatePaise, data.minGuests, data.maxGuests]
    );

    return reply.status(201).send({ package: res.rows[0] });
  });

  // Get caterer's availability & blackout dates (Caterer & Customer calendar)
  server.get('/api/caterers/:id/availability', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const res = await pgPool.query(
        `SELECT id, caterer_id, TO_CHAR(unavailable_date, 'YYYY-MM-DD') as unavailable_date, reason, auto_locked, booking_id
         FROM caterer_svc.caterer_availability
         WHERE caterer_id = $1
         ORDER BY unavailable_date ASC`,
        [id]
      );

      const blackoutDates = res.rows.map((row) => ({
        id: row.id,
        catererId: row.caterer_id,
        unavailableDate: row.unavailable_date,
        reason: row.reason,
        autoLocked: row.auto_locked,
        bookingId: row.booking_id,
      }));

      return reply.send({ blackoutDates, unavailableDates: blackoutDates });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to retrieve availability' });
    }
  });

  // Check specific date availability
  server.get('/api/caterers/:id/check-date', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const { date } = req.query as { date: string };

      if (!date) {
        return reply.status(400).send({ error: 'date query parameter is required (YYYY-MM-DD)' });
      }

      const res = await pgPool.query(
        'SELECT reason, auto_locked FROM caterer_svc.caterer_availability WHERE caterer_id = $1 AND unavailable_date = $2',
        [id, date]
      );

      const available = res.rows.length === 0;
      return reply.send({
        available,
        reason: available ? null : res.rows[0].reason,
        autoLocked: available ? false : res.rows[0].auto_locked,
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to check date availability' });
    }
  });

  // Add manual blackout date (Caterer) - OWNERSHIP GUARD
  server.post('/api/caterers/:id/blackout-dates', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const isOwner = await assertCatererOwner(id, authUser.userId, authUser.role);
      if (!isOwner) {
        return reply.status(403).send({ error: 'Forbidden: You do not own this caterer business' });
      }

      const parseResult = blackoutDateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'ValidationError',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { date, reason } = parseResult.data;

      const res = await pgPool.query(
        `INSERT INTO caterer_svc.caterer_availability (caterer_id, unavailable_date, reason, auto_locked)
         VALUES ($1, $2, $3, FALSE)
         ON CONFLICT (caterer_id, unavailable_date) 
         DO UPDATE SET reason = EXCLUDED.reason
         RETURNING id, caterer_id, TO_CHAR(unavailable_date, 'YYYY-MM-DD') as unavailable_date, reason, auto_locked`,
        [id, date, reason]
      );

      const row = res.rows[0];
      return reply.status(201).send({
        blackoutDate: {
          id: row.id,
          catererId: row.caterer_id,
          unavailableDate: row.unavailable_date,
          reason: row.reason,
          autoLocked: row.auto_locked,
        },
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to set blackout date' });
    }
  });

  // Remove manual blackout date (Caterer) - OWNERSHIP GUARD
  server.delete('/api/caterers/:id/blackout-dates/:date', async (req, reply) => {
    try {
      const { id, date } = req.params as { id: string; date: string };
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const isOwner = await assertCatererOwner(id, authUser.userId, authUser.role);
      if (!isOwner) {
        return reply.status(403).send({ error: 'Forbidden: You do not own this caterer business' });
      }

      // Prevent removing auto-locked dates (dates with active bookings)
      const existing = await pgPool.query(
        'SELECT auto_locked FROM caterer_svc.caterer_availability WHERE caterer_id = $1 AND unavailable_date = $2',
        [id, date]
      );

      if (existing.rows.length === 0) {
        return reply.status(404).send({ error: 'Blackout date not found' });
      }

      if (existing.rows[0].auto_locked) {
        return reply.status(409).send({
          error: 'Cannot remove auto-locked date with an active booking. Cancel the booking first.',
        });
      }

      await pgPool.query(
        'DELETE FROM caterer_svc.caterer_availability WHERE caterer_id = $1 AND unavailable_date = $2',
        [id, date]
      );

      return reply.send({ success: true, message: `Date ${date} reopened for bookings` });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to delete blackout date' });
    }
  });

  // Admin: List all caterers across all statuses with owner info - STRICT ADMIN GUARD
  server.get('/api/admin/caterers', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser || authUser.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden: Admin access required' });
      }

      const { status } = req.query as { status?: string };
      let sql = `
        SELECT 
          c.id, c.owner_id, c.business_name, c.description, c.city, c.service_areas,
          c.cuisines, c.fssai_number, c.gst_number, c.status, c.rejection_reason,
          c.avg_rating, c.review_count, c.created_at, c.updated_at,
          u.full_name as owner_name, u.phone as owner_phone, u.email as owner_email
        FROM caterer_svc.caterers c
        LEFT JOIN auth_svc.users u ON c.owner_id = u.id
      `;
      const params: any[] = [];
      if (status && status !== 'all') {
        params.push(status);
        sql += ` WHERE c.status = $1`;
      }
      sql += ` ORDER BY c.created_at DESC`;

      const res = await pgPool.query(sql, params);
      const caterers = res.rows.map((r) => ({
        id: r.id,
        ownerId: r.owner_id,
        ownerName: r.owner_name,
        ownerPhone: r.owner_phone,
        ownerEmail: r.owner_email,
        businessName: r.business_name,
        description: r.description,
        city: r.city,
        serviceAreas: r.service_areas,
        cuisines: r.cuisines,
        fssaiNumber: r.fssai_number,
        gstNumber: r.gst_number,
        status: r.status,
        rejectionReason: r.rejection_reason,
        avgRating: parseFloat(r.avg_rating || '0'),
        reviewCount: r.review_count,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      return reply.send({ caterers });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to list admin caterers' });
    }
  });

  // Admin: Update caterer status (approve, reject with reason, suspend) - STRICT ADMIN GUARD
  server.patch('/api/admin/caterers/:id/status', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser || authUser.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden: Admin access required' });
      }

      const { id } = req.params as { id: string };
      const { status, rejectionReason } = req.body as {
        status: CatererStatus;
        rejectionReason?: string;
      };

      if (!['pending', 'approved', 'rejected', 'suspended'].includes(status)) {
        return reply.status(400).send({ error: 'Invalid caterer status' });
      }

      if (status === 'rejected' && !rejectionReason) {
        return reply.status(400).send({ error: 'Rejection reason is required when rejecting a caterer' });
      }

      const res = await pgPool.query(
        `UPDATE caterer_svc.caterers
         SET status = $1, rejection_reason = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [status, status === 'rejected' ? rejectionReason : null, id]
      );

      if (res.rows.length === 0) {
        return reply.status(404).send({ error: 'Caterer not found' });
      }

      const r = res.rows[0];
      return reply.send({
        success: true,
        caterer: {
          id: r.id,
          businessName: r.business_name,
          status: r.status,
          rejectionReason: r.rejection_reason,
          updatedAt: r.updated_at,
        },
      });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to update caterer status' });
    }
  });

  return server;
}

if (process.env.NODE_ENV !== 'test') {
  const app = buildCatererServer();
  const PORT = parseInt(process.env.PORT || '4002', 10);
  app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Caterer & Menu Service listening at ${address}`);
  });
}
