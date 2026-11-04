import { describe, it, expect } from 'vitest';
import type { UserRole } from '../src/types/database';

describe('Role-Based Route Guard Logic', () => {
  function getRedirectDestination(
    user: { id: string } | null,
    role: UserRole | null,
    allowedRoles: UserRole[],
    targetPath: string
  ): string | 'allow' {
    if (!user) {
      return '/login';
    }
    if (!role || !allowedRoles.includes(role)) {
      if (role === 'caterer') return '/caterer/dashboard';
      if (role === 'admin') return '/admin/dashboard';
      return '/';
    }
    return 'allow';
  }

  it('redirects unauthenticated users to /login when accessing protected routes', () => {
    expect(getRedirectDestination(null, null, ['caterer'], '/caterer/dashboard')).toBe('/login');
    expect(getRedirectDestination(null, null, ['admin'], '/admin/dashboard')).toBe('/login');
  });

  it('allows access when role matches', () => {
    expect(getRedirectDestination({ id: '1' }, 'caterer', ['caterer'], '/caterer/dashboard')).toBe('allow');
    expect(getRedirectDestination({ id: '2' }, 'admin', ['admin'], '/admin/dashboard')).toBe('allow');
    expect(getRedirectDestination({ id: '3' }, 'customer', ['customer'], '/customer/bookings')).toBe('allow');
  });

  it('redirects cross-role visits to their respective homes and never allows unauthorized viewing', () => {
    // Customer trying to access caterer dashboard -> redirected to customer home /
    expect(getRedirectDestination({ id: '1' }, 'customer', ['caterer'], '/caterer/dashboard')).toBe('/');

    // Customer trying to access admin dashboard -> redirected to customer home /
    expect(getRedirectDestination({ id: '1' }, 'customer', ['admin'], '/admin/dashboard')).toBe('/');

    // Caterer trying to access admin dashboard -> redirected to caterer dashboard
    expect(getRedirectDestination({ id: '2' }, 'caterer', ['admin'], '/admin/dashboard')).toBe('/caterer/dashboard');

    // Admin trying to access caterer dashboard -> redirected to admin dashboard
    expect(getRedirectDestination({ id: '3' }, 'admin', ['caterer'], '/caterer/dashboard')).toBe('/admin/dashboard');
  });
});
