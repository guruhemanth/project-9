import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { loginApi } from '../api';
import { useAuth } from '@/lib/auth/AuthContext';
import { Lock, Mail, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      login(res.token, res.user);

      const from = (location.state as any)?.from?.pathname;
      if (from) {
        navigate(from, { replace: true });
      } else if (res.user.role === 'admin') {
        navigate('/admin/dashboard', { replace: true });
      } else if (res.user.role === 'caterer') {
        navigate('/caterer/dashboard', { replace: true });
      } else {
        setError('Unauthorized: Host accounts must sign in via the Customer App.');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your partner credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[75vh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-slate-900">Partner & Admin Sign In</h2>
          <p className="mt-1 text-sm text-slate-600">Authorized Caterer & Platform Operations Portal</p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Work Email Address</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="caterer@svck.com or admin@caterconnect.com"
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
          >
            {submitting ? 'Signing in...' : 'Sign In to Portal'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-600">
          Want to become an approved caterer in Tirupati?{' '}
          <Link to="/register" className="font-semibold text-amber-600 hover:underline">
            Register your business
          </Link>
        </p>
      </div>
    </div>
  );
};
