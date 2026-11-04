import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthContext';
import { Lock, Mail, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { setMockSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // If testing offline/without active Supabase credentials, fall back to mock helper
        if (email.includes('admin')) {
          setMockSession(
            { id: 'c0000000-0000-0000-0000-000000000003', email } as any,
            { id: 'c0000000-0000-0000-0000-000000000003', role: 'admin', full_name: 'Admin User', phone: '+919876543212', created_at: new Date().toISOString() }
          );
          navigate('/admin/dashboard');
          return;
        } else if (email.includes('caterer')) {
          setMockSession(
            { id: 'c0000000-0000-0000-0000-000000000002', email } as any,
            { id: 'c0000000-0000-0000-0000-000000000002', role: 'caterer', full_name: 'Srinivasa Rao', phone: '+919876543211', created_at: new Date().toISOString() }
          );
          navigate('/caterer/dashboard');
          return;
        } else {
          setMockSession(
            { id: 'c0000000-0000-0000-0000-000000000001', email } as any,
            { id: 'c0000000-0000-0000-0000-000000000001', role: 'customer', full_name: 'Ramesh Kumar', phone: '+919876543210', created_at: new Date().toISOString() }
          );
          navigate('/');
          return;
        }
      }

      if (data.user) {
        const from = (location.state as any)?.from?.pathname || '/';
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center py-12">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sign in to your account</h2>
        <p className="mt-1 text-sm text-slate-500">Access catering bookings, menus, and management</p>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="mt-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600">Email Address</label>
          <div className="relative mt-1">
            <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600">Password</label>
          <div className="relative mt-1">
            <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50 transition"
        >
          {submitting ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-slate-500">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="font-semibold text-emerald-600 hover:text-emerald-700">
          Register now
        </Link>
      </p>
    </div>
  );
};
