import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth/AuthContext';
import { RequireAuth } from './lib/auth/RequireAuth';
import { AppLayout } from './components/layout/AppLayout';
import { CustomerHome } from './features/customer/CustomerHome';
import { CaterersDirectoryPage } from './features/customer/components/CaterersDirectoryPage';
import { CatererDetailView } from './features/customer/components/CatererDetailView';
import { CustomerBookingsList } from './features/customer/components/CustomerBookingsList';
import { CustomerChatHub } from './features/chat/CustomerChatHub';
import { LoginPage } from './features/auth/components/LoginPage';
import { RegisterPage } from './features/auth/components/RegisterPage';
import { TermsPage, PrivacyPage, RefundPolicyPage } from './features/legal';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            {/* Public Customer Routes */}
            <Route path="/" element={<CustomerHome />} />
            <Route path="/caterers" element={<CaterersDirectoryPage />} />
            <Route path="/caterer-profile/:id" element={<CatererDetailView />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/refund-policy" element={<RefundPolicyPage />} />

            {/* Customer Protected Bookings Area */}
            <Route
              path="/customer/bookings"
              element={
                <RequireAuth>
                  <CustomerBookingsList />
                </RequireAuth>
              }
            />
            <Route
              path="/customer/messages"
              element={
                <RequireAuth>
                  <CustomerChatHub />
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
