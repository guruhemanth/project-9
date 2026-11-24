import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { Shield, LogOut, ExternalLink } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-purple-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/admin/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-700 text-white shadow-2xs">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-slate-900">
                CaterConnect Admin
              </span>
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-800">
                Operations Center
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">Pan-India Operations &amp; Verification</p>
          </div>
        </Link>

        {/* Navigation & Portal Jump Links */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden lg:flex items-center gap-2 text-xs">
            <a
              href="http://localhost:5174"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-slate-600 hover:text-amber-700 transition px-2 py-1 rounded-md hover:bg-slate-100"
            >
              <span>Partner App</span>
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="http://localhost:5173"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-slate-600 hover:text-emerald-700 transition px-2 py-1 rounded-md hover:bg-slate-100"
            >
              <span>Customer App</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {user && (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-xs text-purple-900">
                <Shield className="h-3.5 w-3.5 text-purple-700" />
                <span className="font-bold">Admin</span>
                <span className="hidden sm:inline text-slate-500 font-medium">
                  • {profile?.fullName || user.fullName || 'Ops Admin'}
                </span>
              </div>

              <button
                onClick={handleSignOut}
                title="Sign out of Admin Operations"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
