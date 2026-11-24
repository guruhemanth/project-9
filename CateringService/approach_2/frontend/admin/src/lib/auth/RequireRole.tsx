import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ShieldAlert } from 'lucide-react';

interface RequireRoleProps {
  roles: string[];
  children: React.ReactNode;
}

export const RequireRole: React.FC<RequireRoleProps> = ({ roles, children }) => {
  const { user, role, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center text-xs font-medium text-slate-500">
          Verifying administrative authorization...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!role || !roles.includes(role)) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center shadow-xs">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h3 className="text-base font-bold text-red-950">Administrative Access Required</h3>
        <p className="mt-2 text-xs text-red-800 leading-relaxed">
          Your current account is authenticated as a <strong>{role || 'standard user'}</strong>. This
          portal is restricted to CaterConnect Operations Administrators.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            onClick={() => signOut()}
            className="rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-red-800 transition"
          >
            Sign Out &amp; Switch Account
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
