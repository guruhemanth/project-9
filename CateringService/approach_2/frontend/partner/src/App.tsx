import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth/AuthContext';
import { RequireAuth } from './lib/auth/RequireAuth';
import { RequireRole } from './lib/auth/RequireRole';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './features/auth/components/LoginPage';
import { RegisterPage } from './features/auth/components/RegisterPage';
import { CatererDashboard } from './features/caterer/CatererDashboard';
import { CatererPoliciesPage } from './features/caterer/CatererPoliciesPage';
import { PartnerChatHub } from './features/chat/PartnerChatHub';
import { Shield, ArrowRight } from 'lucide-react';

const AdminRedirectNotice: React.FC = () => {
  return (
    <div className="mx-auto mt-12 max-w-md rounded-2xl border border-purple-200 bg-white p-6 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-700 text-white shadow-2xs">
        <Shield className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-bold text-slate-900">Admin Operations Moved</h3>
      <p className="mt-2 text-xs text-slate-600 leading-relaxed">
        The Admin Dashboard now operates on a dedicated port (:5175) for security and operational isolation.
      </p>
      <div className="mt-5">
        <a
          href="http://localhost:5175/admin/dashboard"
          className="inline-flex items-center gap-2 rounded-lg bg-purple-700 px-4 py-2.5 text-xs font-semibold text-white shadow-2xs hover:bg-purple-800 transition"
        >
          <span>Open Admin Console (:5175)</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
};

const PartnerHomeRedirect: React.FC = () => {
  const { user, role, loading } = useAuth();
  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading partner session...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (role === 'admin') {
    return <AdminRedirectNotice />;
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
            <Route
              path="/caterer/chat"
              element={
                <RequireAuth>
                  <RequireRole roles={['caterer']}>
                    <PartnerChatHub />
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/caterer/policies"
              element={
                <RequireAuth>
                  <RequireRole roles={['caterer']}>
                    <CatererPoliciesPage />
                  </RequireRole>
                </RequireAuth>
              }
            />

            {/* Admin Notice on Partner App */}
            <Route
              path="/admin/*"
              element={<AdminRedirectNotice />}
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
