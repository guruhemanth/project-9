import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { ChefHat, Shield, LogOut, ExternalLink } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname.startsWith(path);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          to="/caterer/dashboard"
          className="flex items-center gap-2"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-600 text-white shadow-2xs">
            <ChefHat className="h-5 w-5" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-slate-900">
              CaterConnect Partner
            </span>
            <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
              India Caterer Portal
            </span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-4 text-sm font-medium">
          <Link
            to="/caterer/dashboard"
            className={`hover:text-amber-600 transition ${isActive('/caterer/dashboard') ? 'text-amber-600 font-semibold' : 'text-slate-600'}`}
          >
            Dashboard
          </Link>
          <Link
            to="/caterer/chat"
            className={`hover:text-amber-600 transition ${isActive('/caterer/chat') ? 'text-amber-600 font-semibold' : 'text-slate-600'}`}
          >
            Chat &amp; Messages
          </Link>
          <Link
            to="/caterer/policies"
            className={`hover:text-amber-600 transition ${isActive('/caterer/policies') ? 'text-amber-600 font-semibold' : 'text-slate-600'}`}
          >
            Order Policies
          </Link>
        </nav>

        {/* User Status, Admin Portal Link & Sign Out */}
        <div className="flex items-center gap-3">
          <a
            href="http://localhost:5175"
            target="_blank"
            rel="noreferrer"
            title="Open Dedicated Admin Operations Portal"
            className="hidden sm:flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 transition"
          >
            <Shield className="h-3 w-3" />
            <span>Admin Console (:5175)</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </a>

          {user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                <ChefHat className="h-3.5 w-3.5 text-amber-700" />
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
