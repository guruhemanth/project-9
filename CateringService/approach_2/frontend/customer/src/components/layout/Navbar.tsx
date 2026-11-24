import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  Utensils,
  LogOut,
  Calendar,
  MessageSquare,
  Compass,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/90 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand Logo & Name */}
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-700 to-emerald-500 text-white shadow-xs">
            <Utensils className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-bold tracking-tight text-slate-900">CaterConnect</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                India
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium hidden sm:block">
              Premium Event Catering
            </p>
          </div>
        </Link>

        {/* Clear, User-Friendly Navigation Options */}
        <nav className="flex items-center gap-1 sm:gap-2">
          {/* Home */}
          <Link
            to="/"
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-semibold transition ${
              isActive('/')
                ? 'bg-emerald-50 text-emerald-800'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span>Home</span>
          </Link>

          {/* Dedicated Caterers Directory */}
          <Link
            to="/caterers"
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-semibold transition ${
              isActive('/caterers')
                ? 'bg-emerald-50 text-emerald-800'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Compass className="h-4 w-4 text-emerald-600" />
            <span>Find Caterers</span>
          </Link>

          {/* Protected Links for Authenticated Event Hosts */}
          {user && (
            <>
              <Link
                to="/customer/bookings"
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-semibold transition ${
                  isActive('/customer/bookings')
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Calendar className="h-4 w-4 text-emerald-600" />
                <span>My Bookings</span>
              </Link>
              <Link
                to="/customer/messages"
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-semibold transition ${
                  isActive('/customer/messages')
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <MessageSquare className="h-4 w-4 text-emerald-600" />
                <span>Live Messages</span>
              </Link>
            </>
          )}
        </nav>

        {/* User Account / Auth Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {user ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50/80 px-2.5 py-1.5 border border-emerald-200/60 text-xs">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                  {(profile?.fullName || user.fullName || 'H').slice(0, 1).toUpperCase()}
                </div>
                <div className="flex flex-col text-left">
                  <span className="font-semibold text-emerald-950 leading-none">
                    {profile?.fullName || user.fullName || 'Event Host'}
                  </span>
                  <span className="text-[10px] text-emerald-700 leading-none mt-0.5">
                    Customer Account
                  </span>
                </div>
              </div>

              <button
                onClick={handleSignOut}
                title="Sign out"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-700 shadow-2xs transition"
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
