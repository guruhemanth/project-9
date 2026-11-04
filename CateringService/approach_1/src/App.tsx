import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth/AuthContext';
import { RequireAuth } from './lib/auth/RequireAuth';
import { RequireRole } from './lib/auth/RequireRole';
import { AppLayout } from './components/layout/AppLayout';
import { CustomerHome } from './features/customer/CustomerHome';
import { CatererDetailView } from './features/customer/components/CatererDetailView';
import { CustomerBookingsList } from './features/customer/components/CustomerBookingsList';
import { LoginPage } from './features/auth/components/LoginPage';
import { RegisterPage } from './features/auth/components/RegisterPage';
import { CatererDashboard } from './features/caterer/CatererDashboard';
import { AdminDashboard } from './features/admin/AdminDashboard';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            {/* Public Routes */}
            <Route path="/" element={<CustomerHome />} />
            <Route path="/caterer-profile/:id" element={<CatererDetailView />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Customer Area */}
            <Route
              path="/customer/bookings"
              element={
                <RequireAuth>
                  <CustomerBookingsList />
                </RequireAuth>
              }
            />

            {/* Caterer Area */}
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

            {/* Admin Area */}
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
