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
    bodyLimit: 15728640, // 15MB payload limit for dish photos and media
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
      minGuests: row.min_guests || 25,
      maxGuests: row.max_guests || 2000,
      allowsCustomCombo: row.allows_custom_combo ?? true,
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

  // Helper to format full caterer profile with packages & menu items
  async function getFullCatererProfile(c: any) {
    const id = c.id;
    const packagesRes = await pgPool.query(
      `SELECT p.id, p.name, p.description, p.price_per_plate_paise, p.min_guests, p.max_guests, p.is_active, p.image_url,
        COALESCE(
          json_agg(
            json_build_object(
              'id', pi.id,
              'name', pi.name,
              'category', pi.category,
              'image_url', pi.image_url
            )
          ) FILTER (WHERE pi.id IS NOT NULL), '[]'
        ) as items
       FROM caterer_svc.packages p
       LEFT JOIN caterer_svc.package_items pi ON p.id = pi.package_id
       WHERE p.caterer_id = $1
       GROUP BY p.id, p.name, p.description, p.price_per_plate_paise, p.min_guests, p.max_guests, p.is_active, p.image_url
       ORDER BY p.price_per_plate_paise ASC`,
      [id]
    );

    const packages = packagesRes.rows.map((row) => ({
      id: row.id,
      caterer_id: id,
      name: row.name,
      description: row.description,
      price_per_plate: row.price_per_plate_paise,
      min_guests: row.min_guests,
      max_guests: row.max_guests,
      is_veg: true,
      is_active: row.is_active,
      image_url: row.image_url,
      imageUrl: row.image_url,
      items: row.items,
    }));

    const menuItemsRes = await pgPool.query(
      `SELECT id, name, category, price_paise, is_veg, description, is_available, image_url
       FROM caterer_svc.menu_items
       WHERE caterer_id = $1
       ORDER BY category ASC, name ASC`,
      [id]
    );

    const menuItems = menuItemsRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      pricePaise: row.price_paise,
      price_paise: row.price_paise,
      isVeg: row.is_veg,
      is_veg: row.is_veg,
      description: row.description,
      isAvailable: row.is_available,
      is_available: row.is_available,
      imageUrl: row.image_url,
      image_url: row.image_url,
    }));

    return {
      caterer: {
        id: c.id,
        owner_id: c.owner_id,
        business_name: c.business_name,
        description: c.description,
        city: c.city,
        state: c.state,
        pincode: c.pincode,
        address: c.address,
        service_areas: c.service_areas || [],
        cuisines: c.cuisines || [],
        fssai_number: c.fssai_number,
        gst_number: c.gst_number,
        status: c.status,
        rejection_reason: c.rejection_reason,
        avg_rating: c.avg_rating || 4.8,
        review_count: c.review_count || 0,
        min_guests: c.min_guests || 25,
        max_guests: c.max_guests || 2000,
        lead_time_days: c.lead_time_days || 2,
        allows_custom_combo: c.allows_custom_combo ?? true,
        commission_pct: c.commission_pct || 15.0,
        created_at: c.created_at,
        updated_at: c.updated_at,
      },
      packages,
      menuItems,
    };
  }

  // Get current logged-in caterer profile (owner)
  server.get('/api/caterers/me', async (req, reply) => {
    try {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      const catererRes = await pgPool.query(
        'SELECT * FROM caterer_svc.caterers WHERE owner_id = $1 LIMIT 1',
        [authUser.userId]
      );

      if (catererRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Caterer profile not found for authenticated user' });
      }

      const fullData = await getFullCatererProfile(catererRes.rows[0]);
      return reply.send(fullData);
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to retrieve caterer profile' });
    }
  });

  // Get caterer by owner ID
  server.get('/api/caterers/by-owner/:ownerId', async (req, reply) => {
    try {
      const { ownerId } = req.params as { ownerId: string };
      if (!/^[0-9a-fA-F-]{36}$/.test(ownerId)) {
        return reply.status(400).send({ error: 'Invalid owner ID format' });
      }

      const catererRes = await pgPool.query(
        'SELECT * FROM caterer_svc.caterers WHERE owner_id = $1 LIMIT 1',
        [ownerId]
      );

      if (catererRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Caterer profile not found for owner' });
      }

      const fullData = await getFullCatererProfile(catererRes.rows[0]);
      return reply.send(fullData);
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to retrieve caterer profile by owner' });
    }
  });

  // Get single caterer detail by ID with packages and menu items
  server.get('/api/caterers/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
      return reply.status(404).send({ error: 'Caterer not found' });
    }

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
      `SELECT p.id, p.name, p.description, p.price_per_plate_paise, p.min_guests, p.max_guests, p.is_active, p.image_url,
        COALESCE(
          json_agg(
            json_build_object(
              'id', pi.id,
              'name', pi.name,
              'category', pi.category,
              'image_url', pi.image_url
            )
          ) FILTER (WHERE pi.id IS NOT NULL), '[]'
        ) as items
       FROM caterer_svc.packages p
       LEFT JOIN caterer_svc.package_items pi ON p.id = pi.package_id
       WHERE p.caterer_id = $1
       GROUP BY p.id, p.name, p.description, p.price_per_plate_paise, p.min_guests, p.max_guests, p.is_active, p.image_url
       ORDER BY p.price_per_plate_paise ASC`,
      [id]
    );

    const packages = packagesRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      pricePerPlatePaise: row.price_per_plate_paise,
      price_per_plate: row.price_per_plate_paise,
      minGuests: row.min_guests,
      min_guests: row.min_guests,
      maxGuests: row.max_guests,
      max_guests: row.max_guests,
      is_active: row.is_active,
      imageUrl: row.image_url,
      image_url: row.image_url,
      items: row.items,
    }));

    const menuItemsRes = await pgPool.query(
      `SELECT id, name, category, price_paise, is_veg, description, is_available, image_url
       FROM caterer_svc.menu_items
       WHERE caterer_id = $1
       ORDER BY category ASC, name ASC`,
      [id]
    );

    const menuItems = menuItemsRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      pricePaise: row.price_paise,
      price_paise: row.price_paise,
      isVeg: row.is_veg,
      is_veg: row.is_veg,
      description: row.description,
      isAvailable: row.is_available,
      is_available: row.is_available,
      imageUrl: row.image_url,
      image_url: row.image_url,
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
        minGuests: c.min_guests || 25,
        maxGuests: c.max_guests || 2000,
        allowsCustomCombo: c.allows_custom_combo ?? true,
        packages,
        menuItems,
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

  // Admin update caterer settings (e.g. commission_pct) - ADMIN GUARD
  server.patch('/api/caterers/:id', async (req, reply) => {
    const authUser = getAuthenticatedUser(req);
    if (!authUser || authUser.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden: Admin access required' });
    }

    const { id } = req.params as { id: string };
    const { commissionPct, commission_pct } = (req.body as any) || {};
    const rate = commissionPct !== undefined ? commissionPct : commission_pct;

    if (rate === undefined || typeof rate !== 'number' || rate < 0 || rate > 100) {
      return reply.status(400).send({ error: 'Valid commission rate between 0 and 100 is required' });
    }

    const updateRes = await pgPool.query(
      `UPDATE caterer_svc.caterers
       SET commission_pct = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, business_name, commission_pct, status`,
      [rate, id]
    );

    if (updateRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Caterer not found' });
    }

    return reply.send({
      caterer: {
        id: updateRes.rows[0].id,
        businessName: updateRes.rows[0].business_name,
        commissionPct: parseFloat(updateRes.rows[0].commission_pct),
        status: updateRes.rows[0].status,
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
      `INSERT INTO caterer_svc.packages (caterer_id, name, description, price_per_plate_paise, min_guests, max_guests, is_veg, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, data.name, data.description || '', data.pricePerPlatePaise, data.minGuests, data.maxGuests, data.isVeg ?? false, (data as any).imageUrl || null]
    );

    const createdPackage = res.rows[0];
    const createdItems: any[] = [];

    if (Array.isArray(data.items) && data.items.length > 0) {
      for (const itm of data.items) {
        const itemRes = await pgPool.query(
          `INSERT INTO caterer_svc.package_items (package_id, name, category, image_url)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [createdPackage.id, itm.name, itm.category, (itm as any).imageUrl || null]
        );
        createdItems.push(itemRes.rows[0]);
      }
    }

    return reply.status(201).send({
      package: {
        ...createdPackage,
        items: createdItems,
      },
    });
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

  // Smart auto-fallback resolver for dish photos based on keywords & category
  function resolveSmartDishImage(name: string, category: string, providedUrl?: string | null): string {
    if (providedUrl && providedUrl.trim().length > 0) {
      return providedUrl.trim();
    }

    const n = name.toLowerCase();

    // Starters
    if (n.includes('paneer') && (n.includes('tikka') || n.includes('kebab') || category === 'starter')) {
      return 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80';
    }
    if (n.includes('bajji') || n.includes('pakora') || n.includes('samosa')) {
      return 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80';
    }
    if (n.includes('vada')) {
      return 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80';
    }
    if (n.includes('chicken 65') || n.includes('kebab') || n.includes('seekh') || n.includes('65')) {
      return 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=600&q=80';
    }
    if (n.includes('hara bhara')) {
      return 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80';
    }

    // Mains
    if (n.includes('paneer') && (category === 'main' || n.includes('masala') || n.includes('butter'))) {
      return 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80';
    }
    if (n.includes('dal') || n.includes('pappu') || n.includes('sambar') || n.includes('rasam')) {
      return 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80';
    }
    if (n.includes('vankaya') || n.includes('kurma') || n.includes('kofta') || n.includes('curry')) {
      return 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80';
    }
    if (n.includes('chicken') || n.includes('murgh')) {
      return 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=600&q=80';
    }
    if (n.includes('mutton') || n.includes('gongura') || n.includes('lamb')) {
      return 'https://images.unsplash.com/photo-1545247181-516773cae754?auto=format&fit=crop&w=600&q=80';
    }

    // Breads & Rice
    if (n.includes('chicken') && n.includes('biryani')) {
      return 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=600&q=80';
    }
    if (n.includes('biryani') || n.includes('pulao') || n.includes('bagara') || n.includes('fried rice')) {
      return 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80';
    }
    if (n.includes('naan') || n.includes('roti') || n.includes('paratha') || n.includes('kulcha')) {
      return 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?auto=format&fit=crop&w=600&q=80';
    }
    if (n.includes('rice') || n.includes('pongal')) {
      return 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80';
    }

    // Desserts
    if (n.includes('jamun')) {
      return 'https://images.unsplash.com/photo-1589301773859-bb0d43a6aa9b?auto=format&fit=crop&w=600&q=80';
    }
    if (n.includes('laddu') || n.includes('kaju') || n.includes('sweet') || n.includes('barfi')) {
      return 'https://images.unsplash.com/photo-1605197143984-6992d9d6d1b7?auto=format&fit=crop&w=600&q=80';
    }
    if (n.includes('payasam') || n.includes('kheer')) {
      return 'https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&w=600&q=80';
    }
    if (n.includes('halwa') || n.includes('tukda')) {
      return 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80';
    }

    // Drinks
    if (n.includes('majjiga') || n.includes('buttermilk') || n.includes('lassi')) {
      return 'https://images.unsplash.com/photo-1556881286-fc6915169721?auto=format&fit=crop&w=600&q=80';
    }
    if (n.includes('sharbat') || n.includes('panna') || n.includes('thandai') || n.includes('juice')) {
      return 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80';
    }
    if (n.includes('coffee') || n.includes('chai') || n.includes('tea')) {
      return 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80';
    }
    if (n.includes('coconut')) {
      return 'https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=600&q=80';
    }

    const categoryFallbacks: Record<string, string> = {
      starter: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80',
      main: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
      bread_rice: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
      dessert: 'https://images.unsplash.com/photo-1589301773859-bb0d43a6aa9b?auto=format&fit=crop&w=600&q=80',
      welcome_drink: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
      beverage: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80',
      accompaniment: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
    };

    return categoryFallbacks[category] || 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80';
  }

  // Caterer Menu Item Management (CRUD)
  // List menu items for a caterer
  server.get('/api/caterers/:id/items', async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await pgPool.query(
      `SELECT id, caterer_id, name, category, price_paise, is_veg, description, is_available, image_url, created_at, updated_at
       FROM caterer_svc.menu_items
       WHERE caterer_id = $1
       ORDER BY category ASC, name ASC`,
      [id]
    );
    return reply.send({ items: res.rows });
  });

  // Add a new individual menu item
  server.post('/api/caterers/:id/items', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      // Assert ownership
      if (authUser.role !== 'admin') {
        const cRes = await pgPool.query('SELECT owner_id FROM caterer_svc.caterers WHERE id = $1', [id]);
        if (cRes.rows.length === 0 || cRes.rows[0].owner_id !== authUser.userId) {
          return reply.status(403).send({ error: 'Forbidden: You do not own this caterer business' });
        }
      }

      const { name, category, pricePaise, isVeg, description, imageUrl, image_url } = req.body as {
        name: string;
        category: string;
        pricePaise: number;
        isVeg?: boolean;
        description?: string;
        imageUrl?: string;
        image_url?: string;
      };

      if (!name || !category || pricePaise === undefined) {
        return reply.status(400).send({ error: 'Name, category, and price are required' });
      }

      const validCategories = ['welcome_drink', 'starter', 'main', 'bread_rice', 'dessert', 'beverage', 'accompaniment'];
      if (!validCategories.includes(category)) {
        return reply.status(400).send({ error: `Category must be one of: ${validCategories.join(', ')}` });
      }

      const rawImg = imageUrl || image_url || null;
      const finalImageUrl = resolveSmartDishImage(name.trim(), category, rawImg);

      const insRes = await pgPool.query(
        `INSERT INTO caterer_svc.menu_items (caterer_id, name, category, price_paise, is_veg, description, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, name.trim(), category, pricePaise, isVeg ?? true, description?.trim() || null, finalImageUrl]
      );

      return reply.status(201).send({ item: insRes.rows[0] });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to create menu item' });
    }
  });

  // Bulk upload / upsert menu items
  server.post('/api/caterers/:id/items/bulk', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      // Assert ownership
      if (authUser.role !== 'admin') {
        const cRes = await pgPool.query('SELECT owner_id FROM caterer_svc.caterers WHERE id = $1', [id]);
        if (cRes.rows.length === 0 || cRes.rows[0].owner_id !== authUser.userId) {
          return reply.status(403).send({ error: 'Forbidden: You do not own this caterer business' });
        }
      }

      const { items } = req.body as {
        items: Array<{
          name: string;
          category: string;
          pricePaise?: number;
          priceRupees?: number;
          price_paise?: number;
          price_rupees?: number;
          isVeg?: boolean | string;
          is_veg?: boolean | string;
          description?: string;
          imageUrl?: string;
          image_url?: string;
        }>;
      };

      if (!Array.isArray(items) || items.length === 0) {
        return reply.status(400).send({ error: 'Payload must contain a non-empty items array' });
      }

      const validCategories = new Set([
        'welcome_drink',
        'starter',
        'main',
        'bread_rice',
        'dessert',
        'beverage',
        'accompaniment',
      ]);

      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        let insertedCount = 0;
        let updatedCount = 0;
        const processedItems: any[] = [];

        for (const item of items) {
          if (!item.name || !item.name.trim()) continue;
          const cleanName = item.name.trim();

          // Category normalization
          let cleanCat = (item.category || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
          if (cleanCat === 'drinks' || cleanCat === 'drink') cleanCat = 'beverage';
          if (cleanCat === 'starters') cleanCat = 'starter';
          if (cleanCat === 'mains' || cleanCat === 'curry' || cleanCat === 'curries') cleanCat = 'main';
          if (cleanCat === 'rice' || cleanCat === 'bread' || cleanCat === 'breads') cleanCat = 'bread_rice';
          if (cleanCat === 'desserts' || cleanCat === 'sweet' || cleanCat === 'sweets') cleanCat = 'dessert';
          if (cleanCat === 'chutney' || cleanCat === 'chutneys') cleanCat = 'accompaniment';
          if (!validCategories.has(cleanCat)) {
            cleanCat = 'main';
          }

          // Price normalization
          let finalPricePaise = 0;
          if (typeof item.pricePaise === 'number') {
            finalPricePaise = Math.round(item.pricePaise);
          } else if (typeof item.price_paise === 'number') {
            finalPricePaise = Math.round(item.price_paise);
          } else if (item.priceRupees !== undefined && item.priceRupees !== null) {
            finalPricePaise = Math.round(Number(item.priceRupees) * 100);
          } else if (item.price_rupees !== undefined && item.price_rupees !== null) {
            finalPricePaise = Math.round(Number(item.price_rupees) * 100);
          }
          if (isNaN(finalPricePaise) || finalPricePaise < 0) {
            finalPricePaise = 5000; // default 50 INR
          }

          // Veg status normalization
          let isVeg = true;
          const rawVeg = item.isVeg ?? item.is_veg;
          if (typeof rawVeg === 'boolean') {
            isVeg = rawVeg;
          } else if (typeof rawVeg === 'string') {
            const low = rawVeg.toLowerCase().trim();
            if (low === 'non-veg' || low === 'nonveg' || low === 'false' || low === 'no' || low === '0') {
              isVeg = false;
            }
          }

          const desc = item.description?.trim() || null;
          const resolvedImg = resolveSmartDishImage(cleanName, cleanCat, item.imageUrl || item.image_url);

          // Check if item already exists in this caterer's menu (case-insensitive name match)
          const existRes = await client.query(
            `SELECT id, image_url FROM caterer_svc.menu_items
             WHERE caterer_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))
             LIMIT 1`,
            [id, cleanName]
          );

          if (existRes.rows.length > 0) {
            const existingId = existRes.rows[0].id;
            const existingImg = existRes.rows[0].image_url;
            const finalImg = (item.imageUrl || item.image_url) ? resolvedImg : (existingImg || resolvedImg);

            const upd = await client.query(
              `UPDATE caterer_svc.menu_items
               SET category = $1, price_paise = $2, is_veg = $3, description = COALESCE($4, description),
                   image_url = $5, updated_at = NOW()
               WHERE id = $6
               RETURNING *`,
              [cleanCat, finalPricePaise, isVeg, desc, finalImg, existingId]
            );
            updatedCount++;
            processedItems.push(upd.rows[0]);
          } else {
            const ins = await client.query(
              `INSERT INTO caterer_svc.menu_items
               (caterer_id, name, category, price_paise, is_veg, description, image_url, is_available)
               VALUES ($1, $2, $3, $4, $5, $6, $7, true)
               RETURNING *`,
              [id, cleanName, cleanCat, finalPricePaise, isVeg, desc, resolvedImg]
            );
            insertedCount++;
            processedItems.push(ins.rows[0]);
          }
        }

        await client.query('COMMIT');

        return reply.status(200).send({
          success: true,
          count: processedItems.length,
          inserted: insertedCount,
          updated: updatedCount,
          items: processedItems,
        });
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to process bulk menu upload' });
    }
  });

  // Update an existing menu item (including photo / imageUrl)
  server.patch('/api/caterers/:id/items/:itemId', async (req, reply) => {
    try {
      const { id, itemId } = req.params as { id: string; itemId: string };
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      if (authUser.role !== 'admin') {
        const cRes = await pgPool.query('SELECT owner_id FROM caterer_svc.caterers WHERE id = $1', [id]);
        if (cRes.rows.length === 0 || cRes.rows[0].owner_id !== authUser.userId) {
          return reply.status(403).send({ error: 'Forbidden: You do not own this caterer business' });
        }
      }

      const body = req.body as any;
      const currentRes = await pgPool.query(
        'SELECT * FROM caterer_svc.menu_items WHERE id = $1 AND caterer_id = $2',
        [itemId, id]
      );
      if (currentRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Menu item not found' });
      }
      const curr = currentRes.rows[0];

      const name = body.name !== undefined ? body.name.trim() : curr.name;
      const category = body.category !== undefined ? body.category : curr.category;
      const pricePaise = body.pricePaise !== undefined ? body.pricePaise : (body.price_paise !== undefined ? body.price_paise : curr.price_paise);
      const isVeg = body.isVeg !== undefined ? body.isVeg : (body.is_veg !== undefined ? body.is_veg : curr.is_veg);
      const description = body.description !== undefined ? body.description : curr.description;
      const imageUrl = body.imageUrl !== undefined ? body.imageUrl : (body.image_url !== undefined ? body.image_url : curr.image_url);
      const isAvailable = body.isAvailable !== undefined ? body.isAvailable : (body.is_available !== undefined ? body.is_available : curr.is_available);

      const updRes = await pgPool.query(
        `UPDATE caterer_svc.menu_items
         SET name = $1, category = $2, price_paise = $3, is_veg = $4, description = $5, image_url = $6, is_available = $7, updated_at = NOW()
         WHERE id = $8 AND caterer_id = $9
         RETURNING *`,
        [name, category, pricePaise, isVeg, description, imageUrl, isAvailable, itemId, id]
      );

      return reply.send({ item: updRes.rows[0] });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to update menu item' });
    }
  });

  // Delete a menu item
  server.delete('/api/caterers/:id/items/:itemId', async (req, reply) => {
    try {
      const { id, itemId } = req.params as { id: string; itemId: string };
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      if (authUser.role !== 'admin') {
        const cRes = await pgPool.query('SELECT owner_id FROM caterer_svc.caterers WHERE id = $1', [id]);
        if (cRes.rows.length === 0 || cRes.rows[0].owner_id !== authUser.userId) {
          return reply.status(403).send({ error: 'Forbidden: You do not own this caterer business' });
        }
      }

      await pgPool.query('DELETE FROM caterer_svc.menu_items WHERE id = $1 AND caterer_id = $2', [itemId, id]);
      return reply.send({ success: true, message: 'Item deleted' });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to delete menu item' });
    }
  });

  // Toggle availability of a menu item
  server.patch('/api/caterers/:id/items/:itemId/toggle-availability', async (req, reply) => {
    try {
      const { id, itemId } = req.params as { id: string; itemId: string };
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      if (authUser.role !== 'admin') {
        const cRes = await pgPool.query('SELECT owner_id FROM caterer_svc.caterers WHERE id = $1', [id]);
        if (cRes.rows.length === 0 || cRes.rows[0].owner_id !== authUser.userId) {
          return reply.status(403).send({ error: 'Forbidden: You do not own this caterer business' });
        }
      }

      const updateRes = await pgPool.query(
        `UPDATE caterer_svc.menu_items
         SET is_available = NOT is_available, updated_at = NOW()
         WHERE id = $1 AND caterer_id = $2
         RETURNING *`,
        [itemId, id]
      );

      if (updateRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Menu item not found' });
      }

      return reply.send({ item: updateRes.rows[0] });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to update menu item' });
    }
  });

  // Update Caterer Guest & Order Settings (min_guests, max_guests, lead_time_days)
  server.patch('/api/caterers/:id/settings', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
      }

      if (authUser.role !== 'admin') {
        const cRes = await pgPool.query('SELECT owner_id FROM caterer_svc.caterers WHERE id = $1', [id]);
        if (cRes.rows.length === 0 || cRes.rows[0].owner_id !== authUser.userId) {
          return reply.status(403).send({ error: 'Forbidden: You do not own this caterer business' });
        }
      }

      const { minGuests, maxGuests, leadTimeDays, allowsCustomCombo } = req.body as {
        minGuests?: number;
        maxGuests?: number;
        leadTimeDays?: number;
        allowsCustomCombo?: boolean;
      };

      const res = await pgPool.query(
        `UPDATE caterer_svc.caterers
         SET min_guests = COALESCE($1, min_guests),
             max_guests = COALESCE($2, max_guests),
             lead_time_days = COALESCE($3, lead_time_days),
             allows_custom_combo = COALESCE($4, allows_custom_combo),
             updated_at = NOW()
         WHERE id = $5
         RETURNING id, business_name, min_guests, max_guests, lead_time_days, allows_custom_combo`,
        [minGuests, maxGuests, leadTimeDays, allowsCustomCombo, id]
      );

      return reply.send({ settings: res.rows[0] });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Failed to update caterer settings' });
    }
  });

  return server;
}

if (process.env.NODE_ENV !== 'test') {
  const app = buildCatererServer();
  const PORT = parseInt(process.env.CATERER_PORT || (process.env.PORT && process.env.PORT !== '8080' ? process.env.PORT : '4002'), 10);
  app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Caterer & Menu Service listening at ${address}`);
  });
}
