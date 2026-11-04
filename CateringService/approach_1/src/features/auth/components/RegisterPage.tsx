import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthContext';
import { AlertCircle, User, ChefHat } from 'lucide-react';
import type { UserRole } from '@/types/database';

export const RegisterPage: React.FC = () => {
  const [role, setRole] = useState<UserRole>('customer');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+91');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { setMockSession } = useAuth();
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError || !data.user) {
        // Fallback for offline/mock demo setup
        const fakeId = 'c0000000-0000-0000-0000-' + Math.floor(100000000000 + Math.random() * 900000000000);
        setMockSession(
          { id: fakeId, email } as any,
          {
            id: fakeId,
            role,
            full_name: fullName,
            phone,
            created_at: new Date().toISOString(),
          }
        );

        if (role === 'caterer') navigate('/caterer/dashboard');
        else navigate('/');
        return;
      }

      if (data.user) {
        if (role === 'caterer') navigate('/caterer/dashboard');
        else navigate('/');
      }
    } catch (err: any) {
      setError(err?.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center py-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Create an Account</h2>
        <p className="mt-1 text-sm text-slate-500">Join CaterConnect in Tirupati</p>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Role Selection */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setRole('customer')}
          className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition ${
            role === 'customer'
              ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold shadow-xs'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
          }`}
        >
          <User className="h-5 w-5 mb-1 text-emerald-600" />
          <span className="text-xs">I want to Order</span>
        </button>

        <button
          type="button"
          onClick={() => setRole('caterer')}
          className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition ${
            role === 'caterer'
              ? 'border-amber-600 bg-amber-50 text-amber-900 font-semibold shadow-xs'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
          }`}
        >
          <ChefHat className="h-5 w-5 mb-1 text-amber-600" />
          <span className="text-xs">I am a Caterer</span>
        </button>
      </div>

      <form onSubmit={handleRegister} className="mt-6 space-y-3.5">
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600">Full Name</label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Ramesh Kumar"
            className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600">Phone (+91 format)</label>
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+919876543210"
            className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600">Email Address</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600">Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full mt-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50 transition"
        >
          {submitting ? 'Creating account...' : `Sign Up as ${role === 'caterer' ? 'Caterer' : 'Customer'}`}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-slate-500">
        Already registered?{' '}
        <Link to="/login" className="font-semibold text-emerald-600 hover:text-emerald-700">
          Sign In
        </Link>
      </p>
    </div>
  );
};
