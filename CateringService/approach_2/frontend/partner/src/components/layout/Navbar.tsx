import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { ChefHat, Shield, LogOut } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, profile, role, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          to={role === 'admin' ? '/admin/dashboard' : '/caterer/dashboard'}
          className="flex items-center gap-2"
        >
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-2xs ${
              role === 'admin' ? 'bg-purple-700' : 'bg-amber-600'
            }`}
          >
            {role === 'admin' ? <Shield className="h-5 w-5" /> : <ChefHat className="h-5 w-5" />}
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-slate-900">
              {role === 'admin' ? 'CaterConnect Admin' : 'CaterConnect Partner'}
            </span>
            <span
              className={`ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                role === 'admin'
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {role === 'admin' ? 'Operations Center' : 'India Caterer Portal'}
            </span>
          </div>
        </Link>

        {/* User Status & Sign Out */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <div
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 border text-xs ${
                  role === 'admin'
                    ? 'bg-purple-50 border-purple-200 text-purple-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                {role === 'admin' ? (
                  <Shield className="h-3.5 w-3.5 text-purple-700" />
                ) : (
                  <ChefHat className="h-3.5 w-3.5 text-amber-700" />
                )}
                <span className="font-bold capitalize">{role}</span>
                <span className="hidden sm:inline text-slate-500 font-medium">
                  • {profile?.fullName || user.fullName || 'Partner'}
                </span>
              </div>

              <button
                onClick={handleSignOut}
                title="Sign out"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="rounded-lg px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="rounded-lg bg-amber-600 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-amber-700 shadow-2xs transition"
              >
                Register Caterer
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
