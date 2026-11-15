import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle, Clock, Lock, X, ArrowRight, ShieldAlert } from 'lucide-react';

interface RateLimitState {
  message: string;
  cause: string;
  retryAfter: number;
  secondsLeft: number;
}

interface SessionExpiredState {
  message: string;
}

export const GlobalFeedbackBanner: React.FC = () => {
  const [rateLimit, setRateLimit] = useState<RateLimitState | null>(null);
  const [sessionExpired, setSessionExpired] = useState<SessionExpiredState | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Rate Limit Event Listener & Live Countdown
  useEffect(() => {
    const handleRateLimit = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const retry = Number(detail.retryAfter) > 0 ? Number(detail.retryAfter) : 60;

      setRateLimit({
        message: detail.message || 'Request threshold reached. Please wait before retrying.',
        cause: detail.cause || 'Too many requests sent in a short period.',
        retryAfter: retry,
        secondsLeft: retry,
      });
    };

    window.addEventListener('caterconnect:rate-limit-error', handleRateLimit);
    return () => {
      window.removeEventListener('caterconnect:rate-limit-error', handleRateLimit);
    };
  }, []);

  // Countdown timer for Rate Limit
  useEffect(() => {
    if (!rateLimit || rateLimit.secondsLeft <= 0) return;

    const timer = setInterval(() => {
      setRateLimit((prev) => {
        if (!prev) return null;
        if (prev.secondsLeft <= 1) {
          return null; // Automatically clear once countdown completes
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [rateLimit]);

  // Session Expired Event Listener
  useEffect(() => {
    const handleSessionExpired = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      // If user is already on login or register, don't show the floating session banner
      if (location.pathname === '/login' || location.pathname === '/register') {
        return;
      }
      setSessionExpired({
        message: detail.message || 'Your session has expired. Please sign in again to continue.',
      });
    };

    window.addEventListener('caterconnect:session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('caterconnect:session-expired', handleSessionExpired);
    };
  }, [location.pathname]);

  const handleSignInRedirect = () => {
    setSessionExpired(null);
    navigate('/login', {
      state: {
        from: location,
        sessionExpired: true,
        sessionMessage: sessionExpired?.message,
      },
    });
  };

  if (!rateLimit && !sessionExpired) {
    return null;
  }

  return (
    <aside aria-label="System notices" className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-md w-full px-4 sm:px-0 pointer-events-none">
      {/* Rate Limit Active Notice */}
      {rateLimit && (
        <div className="pointer-events-auto overflow-hidden rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-lg shadow-amber-900/10 transition-all animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-700">
              <AlertTriangle className="h-5 w-5 shrink-0" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  Rate Limit Exceeded
                </span>
                <button
                  type="button"
                  onClick={() => setRateLimit(null)}
                  className="rounded p-1 text-amber-700 hover:bg-amber-200/50 transition"
                  title="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-1.5 space-y-1">
                <p className="text-xs font-semibold text-amber-950">
                  Cause: <span className="font-normal text-amber-900">{rateLimit.cause}</span>
                </p>
                <p className="text-xs text-amber-800 leading-relaxed">
                  {rateLimit.message}
                </p>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-md bg-amber-200/60 px-2.5 py-1 text-xs font-bold text-amber-900">
                  <Clock className="h-3.5 w-3.5 animate-spin" />
                  <span>Try again in {rateLimit.secondsLeft}s</span>
                </div>
                <span className="text-[11px] text-amber-700">Requests are temporarily paused</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Session Expired Notice */}
      {sessionExpired && (
        <div className="pointer-events-auto overflow-hidden rounded-xl border border-rose-300 bg-white p-4 shadow-lg shadow-rose-950/10 transition-all animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-rose-50 p-2 text-rose-600">
              <ShieldAlert className="h-5 w-5 shrink-0" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-900">
                  Session Ended
                </span>
                <button
                  type="button"
                  onClick={() => setSessionExpired(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                  title="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                {sessionExpired.message}
              </p>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSignInRedirect}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800 transition"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>Sign In Again</span>
                  <ArrowRight className="h-3 w-3 ml-0.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setSessionExpired(null)}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 transition px-2 py-1"
                >
                  Continue as Guest
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
