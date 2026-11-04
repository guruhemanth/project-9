import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, X, LogIn, UserPlus } from 'lucide-react';

interface Props {
  catererName: string;
  packageName: string;
  onClose: () => void;
}

export const AuthRequiredModal: React.FC<Props> = ({
  catererName,
  packageName,
  onClose,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignIn = () => {
    navigate('/login', { state: { from: location } });
  };

  const handleRegister = () => {
    navigate('/register', { state: { from: location } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="text-center pt-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 mb-4 shadow-2xs">
            <Lock className="h-7 w-7" />
          </div>

          <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold text-emerald-800">
            Sign In Required
          </span>

          <h3 className="mt-2 text-xl font-bold text-slate-900">
            Sign in to Book Catering
          </h3>

          <p className="mt-2 text-xs text-slate-600 leading-relaxed px-2">
            To book <b>{packageName}</b> by <b>{catererName}</b>, customize your guest count, and receive direct event confirmation, please sign in to your host account.
          </p>
        </div>

        <div className="mt-6 space-y-2.5">
          <button
            type="button"
            onClick={handleSignIn}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 transition"
          >
            <LogIn className="h-4 w-4" />
            <span>Sign In to Continue</span>
          </button>

          <button
            type="button"
            onClick={handleRegister}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <UserPlus className="h-4 w-4 text-emerald-600" />
            <span>Create New Host Account</span>
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-400">
          Takes less than 30 seconds • No credit card required to explore
        </p>
      </div>
    </div>
  );
};
