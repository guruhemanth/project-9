import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import bcrypt from 'bcryptjs';
import { registerSchema, loginSchema } from '@caterconnect/shared';
import { findUserByEmail, findUserById, createUser } from './users';
export function buildAuthServer() {
    const server = Fastify({ logger: false });
    server.register(fastifyCors, { origin: true });
    server.register(fastifyJwt, {
        secret: process.env.JWT_SECRET || 'super-secret-jwt-token-with-at-least-32-characters-long',
    });
    // Health check
    server.get('/health', async () => ({ status: 'ok', service: 'auth-service' }));
    // Register
    server.post('/api/auth/register', async (req, reply) => {
        const parseResult = registerSchema.safeParse(req.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                error: 'ValidationError',
                details: parseResult.error.flatten().fieldErrors,
            });
        }
        const { email, password, fullName, phone, role } = parseResult.data;
        const existing = await findUserByEmail(email);
        if (existing) {
            return reply.status(409).send({ error: 'Email already registered' });
        }
        const newUser = await createUser({ email, password, fullName, phone, role });
        const token = server.jwt.sign({
            sub: newUser.id,
            role: newUser.role,
            email,
        });
        return reply.status(201).send({
            user: newUser,
            token,
        });
    });
    // Login
    server.post('/api/auth/login', async (req, reply) => {
        try {
            const parseResult = loginSchema.safeParse(req.body);
            if (!parseResult.success) {
                return reply.status(400).send({ error: 'Invalid credentials format' });
            }
            const { email, password } = parseResult.data;
            const user = await findUserByEmail(email);
            if (!user) {
                return reply.status(401).send({ error: 'Invalid email or password' });
            }
            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                return reply.status(401).send({ error: 'Invalid email or password' });
            }
            const token = server.jwt.sign({
                sub: user.id,
                role: user.role,
                email: user.email,
            });
            return reply.send({
                user: {
                    id: user.id,
                    role: user.role,
                    fullName: user.full_name,
                    phone: user.phone,
                    createdAt: user.created_at,
                },
                token,
            });
        }
        catch (err) {
            console.error('LOGIN ERROR DETAILS:', err);
            return reply.status(500).send({ error: err.message || 'Internal Server Error' });
        }
    });
    // Me / Profile
    server.get('/api/auth/me', async (req, reply) => {
        try {
            await req.jwtVerify();
            const payload = req.user;
            const user = await findUserById(payload.sub);
            if (!user) {
                return reply.status(404).send({ error: 'User not found' });
            }
            return reply.send({ user });
        }
        catch {
            return reply.status(401).send({ error: 'Unauthorized token' });
        }
    });
    // Internal Verify Token for Gateway
    server.post('/api/auth/verify', async (req, reply) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return reply.status(401).send({ valid: false });
            }
            const token = authHeader.replace('Bearer ', '');
            const decoded = server.jwt.verify(token);
            return reply.send({ valid: true, user: decoded });
        }
        catch {
            return reply.status(401).send({ valid: false });
        }
    });
    return server;
}
if (process.env.NODE_ENV !== 'test') {
    const server = buildAuthServer();
    const PORT = Number(process.env.PORT) || 4001;
    server.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        console.log(`Auth Service listening on ${address}`);
    });
}
