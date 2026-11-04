import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { Utensils, LogOut, User as UserIcon, Shield, ChefHat } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, profile, role, signOut, setMockSession } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  // Fast switcher for local testing of roles
  const switchRole = (newRole: 'customer' | 'caterer' | 'admin') => {
    const mockUsers = {
      customer: {
        id: 'c0000000-0000-0000-0000-000000000001',
        email: 'customer@example.com',
      },
      caterer: {
        id: 'c0000000-0000-0000-0000-000000000002',
        email: 'caterer@example.com',
      },
      admin: {
        id: 'c0000000-0000-0000-0000-000000000003',
        email: 'admin@caterconnect.in',
      },
    };

    const target = mockUsers[newRole];
    setMockSession(
      { id: target.id, email: target.email } as any,
      {
        id: target.id,
        role: newRole,
        full_name: `${newRole.toUpperCase()} User`,
        phone: '+919876543210',
        created_at: new Date().toISOString(),
      }
    );

    if (newRole === 'caterer') navigate('/caterer/dashboard');
    else if (newRole === 'admin') navigate('/admin/dashboard');
    else navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Utensils className="h-5 w-5" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-slate-900">CaterConnect</span>
            <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
              Tirupati
            </span>
          </div>
        </Link>

        {/* Demo Quick Switcher */}
        <div className="hidden md:flex items-center gap-1.5 rounded-full bg-slate-100 p-1 text-xs">
          <span className="px-2 text-slate-500 font-medium">Switch:</span>
          <button
            onClick={() => switchRole('customer')}
            className={`rounded-full px-2.5 py-1 font-medium transition ${
              role === 'customer' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Customer
          </button>
          <button
            onClick={() => switchRole('caterer')}
            className={`rounded-full px-2.5 py-1 font-medium transition ${
              role === 'caterer' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Caterer
          </button>
          <button
            onClick={() => switchRole('admin')}
            className={`rounded-full px-2.5 py-1 font-medium transition ${
              role === 'admin' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Admin
          </button>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 border border-slate-200 text-xs">
                {role === 'admin' ? (
                  <Shield className="h-3.5 w-3.5 text-purple-600" />
                ) : role === 'caterer' ? (
                  <ChefHat className="h-3.5 w-3.5 text-amber-600" />
                ) : (
                  <UserIcon className="h-3.5 w-3.5 text-emerald-600" />
                )}
                <span className="font-semibold capitalize text-slate-700">{role || 'user'}</span>
                {profile?.full_name && (
                  <span className="hidden sm:inline text-slate-500">• {profile.full_name}</span>
                )}
              </div>

              {role === 'caterer' && (
                <Link
                  to="/caterer/dashboard"
                  className="hidden sm:inline-flex text-xs font-medium text-slate-600 hover:text-emerald-600"
                >
                  Dashboard
                </Link>
              )}
              {role === 'admin' && (
                <Link
                  to="/admin/dashboard"
                  className="hidden sm:inline-flex text-xs font-medium text-slate-600 hover:text-purple-600"
                >
                  Admin Panel
                </Link>
              )}

              <button
                onClick={handleSignOut}
                title="Sign out"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700 shadow-sm"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
