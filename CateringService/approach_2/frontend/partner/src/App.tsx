import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth/AuthContext';
import { RequireAuth } from './lib/auth/RequireAuth';
import { RequireRole } from './lib/auth/RequireRole';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './features/auth/components/LoginPage';
import { RegisterPage } from './features/auth/components/RegisterPage';
import { CatererDashboard } from './features/caterer/CatererDashboard';
import { AdminDashboard } from './features/admin/AdminDashboard';

const PartnerHomeRedirect: React.FC = () => {
  const { user, role, loading } = useAuth();
  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading portal session...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <Navigate to="/caterer/dashboard" replace />;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            {/* Root redirects according to authenticated role */}
            <Route path="/" element={<PartnerHomeRedirect />} />

            {/* Public Partner Auth */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Caterer Portal */}
            <Route
              path="/caterer/dashboard"
              element={
                <RequireAuth>
                  <RequireRole roles={['caterer']}>
                    <CatererDashboard />
                  </RequireRole>
                </RequireAuth>
              }
            />

            {/* Admin Operations Center */}
            <Route
              path="/admin/dashboard"
              element={
                <RequireAuth>
                  <RequireRole roles={['admin']}>
                    <AdminDashboard />
                  </RequireRole>
                </RequireAuth>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
