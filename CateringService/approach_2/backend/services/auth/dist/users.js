import { pgPool } from './db';
import bcrypt from 'bcryptjs';
export async function findUserByEmail(email) {
    const result = await pgPool.query('SELECT * FROM auth_svc.users WHERE email = $1 LIMIT 1', [email.toLowerCase().trim()]);
    return result.rows[0] || null;
}
export async function findUserById(id) {
    const result = await pgPool.query('SELECT id, role, full_name, phone, created_at FROM auth_svc.users WHERE id = $1 LIMIT 1', [id]);
    if (!result.rows[0])
        return null;
    const row = result.rows[0];
    return {
        id: row.id,
        role: row.role,
        fullName: row.full_name,
        phone: row.phone,
        createdAt: row.created_at,
    };
}
export async function createUser(data) {
    const passwordHash = await bcrypt.hash(data.password, 10);
    const result = await pgPool.query(`INSERT INTO auth_svc.users (email, password_hash, role, full_name, phone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, role, full_name, phone, created_at`, [data.email.toLowerCase().trim(), passwordHash, data.role, data.fullName, data.phone]);
    const row = result.rows[0];
    return {
        id: row.id,
        role: row.role,
        fullName: row.full_name,
        phone: row.phone,
        createdAt: row.created_at,
    };
}
