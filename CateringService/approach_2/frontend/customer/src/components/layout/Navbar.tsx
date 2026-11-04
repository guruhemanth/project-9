import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { Utensils, LogOut, User as UserIcon, Calendar } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-2xs">
            <Utensils className="h-5 w-5" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-slate-900">CaterConnect</span>
            <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
              India
            </span>
          </div>
        </Link>

        {/* Navigation & User Profile */}
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="text-xs sm:text-sm font-semibold text-slate-600 hover:text-emerald-700 transition"
          >
            Find Caterers
          </Link>

          {user && (
            <Link
              to="/customer/bookings"
              className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-emerald-700 transition"
            >
              <Calendar className="h-4 w-4 text-emerald-600" />
              <span>My Bookings</span>
            </Link>
          )}

          {user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 border border-emerald-100 text-xs">
                <UserIcon className="h-3.5 w-3.5 text-emerald-600" />
                <span className="font-semibold text-emerald-950">
                  {profile?.fullName || user.fullName || 'Host'}
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
                className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-700 shadow-2xs transition"
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
