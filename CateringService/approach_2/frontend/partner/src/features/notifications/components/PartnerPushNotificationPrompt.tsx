import React, { useState, useEffect } from 'react';
import { Bell, Info, CheckCircle2 } from 'lucide-react';

export const PartnerPushNotificationPrompt: React.FC = () => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ('Notification' in window) {
        setPermission(Notification.permission);
      }
      const userAgent = window.navigator.userAgent.toLowerCase();
      setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    }
  }, []);

  const handleSubscribe = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setMessage('Web Push notifications are not supported on this browser.');
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        setMessage('Notification permission was declined.');
        setLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        const vapidPublicKey = (import.meta as any).env.VITE_VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
        
        const padding = '='.repeat((4 - (vapidPublicKey.length % 4)) % 4);
        const base64 = (vapidPublicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: outputArray,
        });
      }

      const rawKey = subscription.getKey ? subscription.getKey('p256dh') : null;
      const rawAuth = subscription.getKey ? subscription.getKey('auth') : null;

      const p256dh = rawKey ? btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(rawKey)))) : '';
      const auth = rawAuth ? btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(rawAuth)))) : '';

      const token = localStorage.getItem('token') || localStorage.getItem('auth_token');

      await fetch('/api/notify/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: { p256dh, auth },
          userAgent: navigator.userAgent,
        }),
      });

      setIsSubscribed(true);
      setMessage('Partner order alerts enabled!');
    } catch (err: any) {
      console.error('Push subscription failed:', err);
      setMessage(err.message || 'Failed to enable push notifications');
    } finally {
      setLoading(false);
    }
  };

  if (permission === 'granted' && isSubscribed) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800 border border-emerald-200">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        <span>New booking sound & push alerts enabled.</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-900">Live Booking Alerts</h4>
            <p className="text-[11px] text-slate-600">Never miss a new event inquiry or customer advance payment.</p>
          </div>
        </div>
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Enabling...' : 'Enable Alerts'}
        </button>
      </div>

      {isIOS && (
        <div className="mt-2.5 flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 p-2 rounded-md">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>iOS Tip: On iPhone/iPad, Web Push requires adding CaterConnect Partner to your Home Screen first (Share → Add to Home Screen).</span>
        </div>
      )}

      {message && (
        <p className="mt-2 text-[11px] text-slate-600 italic">{message}</p>
      )}
    </div>
  );
};
