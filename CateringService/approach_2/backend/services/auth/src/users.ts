import { pgPool } from './db';
import bcrypt from 'bcryptjs';
import type { UserProfile, UserRole } from '@caterconnect/shared';

export interface UserEntity {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  full_name: string;
  phone: string;
  created_at: string;
  updated_at: string;
}

export async function findUserByEmail(email: string): Promise<UserEntity | null> {
  const result = await pgPool.query(
    'SELECT * FROM auth_svc.users WHERE email = $1 LIMIT 1',
    [email.toLowerCase().trim()]
  );
  return (result.rows[0] as UserEntity) || null;
}

export async function findUserById(id: string): Promise<UserProfile | null> {
  const result = await pgPool.query(
    'SELECT id, role, full_name, phone, created_at FROM auth_svc.users WHERE id = $1 LIMIT 1',
    [id]
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    role: row.role as UserRole,
    fullName: row.full_name,
    phone: row.phone,
    createdAt: row.created_at,
  };
}

export async function createUser(data: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  role: UserRole;
}): Promise<UserProfile> {
  const passwordHash = await bcrypt.hash(data.password, 10);
  const result = await pgPool.query(
    `INSERT INTO auth_svc.users (email, password_hash, role, full_name, phone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, role, full_name, phone, created_at`,
    [data.email.toLowerCase().trim(), passwordHash, data.role, data.fullName, data.phone]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    role: row.role as UserRole,
    fullName: row.full_name,
    phone: row.phone,
    createdAt: row.created_at,
  };
}
