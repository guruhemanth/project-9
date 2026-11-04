import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { UserRole } from '@/types/database';

interface RequireRoleProps {
  roles: UserRole[];
  children: React.ReactNode;
}

export const RequireRole: React.FC<RequireRoleProps> = ({ roles, children }) => {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm font-medium text-slate-500 animate-pulse">Checking permissions...</div>
      </div>
    );
  }

  if (!role || !roles.includes(role)) {
    // Redirect to the appropriate home base for the current role, or root
    if (role === 'caterer') {
      return <Navigate to="/caterer/dashboard" replace />;
    } else if (role === 'admin') {
      return <Navigate to="/admin/dashboard" replace />;
    } else {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};
