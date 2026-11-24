import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { loginApi } from '../api';
import { useAuth } from '@/lib/auth/AuthContext';
import { Shield, AlertCircle, ArrowRight } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('admin@caterconnect.in');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await loginApi({ email, password });
      if (res.user.role !== 'admin') {
        setError(
          `Unauthorized: Account is registered as "${res.user.role}". Only administrators may access the Operations Center.`
        );
        return;
      }

      login(res.token, res.user);

      const from = (location.state as any)?.from?.pathname;
      navigate(from || '/admin/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify administrative credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[75vh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-purple-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-700 text-white shadow-sm">
            <Shield className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Operations Sign In</h2>
          <p className="mt-1 text-sm text-purple-700 font-medium">
            CaterConnect Platform Administration (Port 5175)
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Admin Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-purple-600 focus:outline-hidden focus:ring-1 focus:ring-purple-600"
              placeholder="admin@caterconnect.in"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-purple-600 focus:outline-hidden focus:ring-1 focus:ring-purple-600"
              placeholder="••••••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-purple-700 py-2.5 text-sm font-semibold text-white shadow-2xs hover:bg-purple-800 disabled:opacity-50 transition"
          >
            {submitting ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Access Operations Center</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-100 pt-4 text-center">
          <p className="text-[11px] text-slate-500">
            Dedicated administrative console. For caterer onboarding and orders, visit the{' '}
            <a
              href="http://localhost:5174"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-amber-600 hover:underline"
            >
              Partner Portal (:5174)
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
};
