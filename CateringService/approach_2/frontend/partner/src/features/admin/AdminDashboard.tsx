import React, { useEffect, useState } from 'react';
import {
  Shield,
  Percent,
  TrendingUp,
  Calendar,
  IndianRupee,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { AdminAnalyticsCards } from './components/AdminAnalyticsCards';
import { PendingCatererQueue } from './components/PendingCatererQueue';
import { AdminBookingsList } from './components/AdminBookingsList';
import { AdminSettlementsList } from './components/AdminSettlementsList';
import { CommissionSettingsCard } from './components/CommissionSettingsCard';
import {
  fetchAdminAnalytics,
  fetchAdminCaterers,
  updateCatererStatus,
  fetchAdminBookings,
  adminCancelBooking,
  fetchAdminSettlements,
  disburseSettlement,
} from './api';
import type { PlatformAnalytics, AdminCaterer, CatererSettlement, Booking } from '@caterconnect/shared';

type AdminTab = 'analytics' | 'caterers' | 'bookings' | 'settlements' | 'settings';

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('analytics');
  const [commissionPct, setCommissionPct] = useState(15.0);

  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
  const [caterers, setCaterers] = useState<AdminCaterer[]>([]);
  const [bookings, setBookings] = useState<(Booking & any)[]>([]);
  const [settlements, setSettlements] = useState<(CatererSettlement & any)[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAllAdminData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);

      const [aRes, cRes, bRes, sRes] = await Promise.allSettled([
        fetchAdminAnalytics(),
        fetchAdminCaterers(),
        fetchAdminBookings(),
        fetchAdminSettlements(),
      ]);

      if (aRes.status === 'fulfilled' && aRes.value?.analytics) {
        setAnalytics(aRes.value.analytics);
      } else {
        setAnalytics({
          totalGMVPaise: 0,
          totalCommissionPaise: 0,
          totalDisbursedPaise: 0,
          pendingPayoutsPaise: 0,
          totalBookingsCount: 0,
          paidBookingsCount: 0,
          pendingSettlementCount: 0,
          settledCount: 0,
          totalCaterersCount: 0,
          approvedCaterersCount: 0,
          pendingCaterersCount: 0,
        });
      }

      if (cRes.status === 'fulfilled' && Array.isArray(cRes.value?.caterers)) {
        setCaterers(cRes.value.caterers);
      } else {
        setCaterers([]);
      }

      if (bRes.status === 'fulfilled' && Array.isArray(bRes.value?.bookings)) {
        setBookings(bRes.value.bookings);
      } else {
        setBookings([]);
      }

      if (sRes.status === 'fulfilled' && Array.isArray(sRes.value?.settlements)) {
        setSettlements(sRes.value.settlements);
      } else {
        setSettlements([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load admin metrics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAllAdminData();
  }, []);

  const handleStatusChange = async (catererId: string, newStatus: string, reason?: string) => {
    try {
      await updateCatererStatus(catererId, newStatus, reason);
      await loadAllAdminData(true);
    } catch (err: any) {
      alert(`Status update failed: ${err.message}`);
    }
  };

  const handleCancelDispute = async (bookingId: string, reason: string) => {
    try {
      await adminCancelBooking(bookingId, reason);
      await loadAllAdminData(true);
    } catch (err: any) {
      alert(`Dispute cancellation failed: ${err.message}`);
    }
  };

  const handleDisburse = async (settlementId: string, utrReference: string) => {
    try {
      await disburseSettlement(settlementId, utrReference);
      await loadAllAdminData(true);
    } catch (err: any) {
      alert(`Disbursal failed: ${err.message}`);
    }
  };

  const pendingCatererCount = caterers.filter((c) => c.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-purple-700" />
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">Admin Operations Center</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Super-dashboard: Pan-India caterer verification, platform commission ledger, bookings, and payout settlements.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => loadAllAdminData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <div className="flex items-center gap-1.5 rounded-lg bg-purple-100 px-3 py-1.5 text-xs font-bold text-purple-900 border border-purple-200">
            <Percent className="h-3.5 w-3.5" />
            <span>Platform Commission: {commissionPct}%</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-center gap-2 text-xs text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto no-scrollbar pb-1">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === 'analytics'
              ? 'border-purple-700 text-purple-800 bg-purple-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          <span>Financial Analytics & GMV</span>
        </button>

        <button
          onClick={() => setActiveTab('caterers')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition whitespace-nowrap relative ${
            activeTab === 'caterers'
              ? 'border-purple-700 text-purple-800 bg-purple-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Shield className="h-4 w-4" />
          <span>Caterer FSSAI Verification</span>
          {pendingCatererCount > 0 && (
            <span className="ml-1 rounded-full bg-amber-500 text-white text-[10px] px-1.5 py-0.2 font-extrabold">
              {pendingCatererCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('bookings')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === 'bookings'
              ? 'border-purple-700 text-purple-800 bg-purple-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Calendar className="h-4 w-4" />
          <span>All Bookings ({bookings.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('settlements')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === 'settlements'
              ? 'border-purple-700 text-purple-800 bg-purple-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <IndianRupee className="h-4 w-4" />
          <span>Payout Settlements ({settlements.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === 'settings'
              ? 'border-purple-700 text-purple-800 bg-purple-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Percent className="h-4 w-4" />
          <span>Commission Rules</span>
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <AdminAnalyticsCards analytics={analytics} loading={loading} />

          {/* Quick Overview Split */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between">
                <span>Recent Booking Activity</span>
                <button
                  onClick={() => setActiveTab('bookings')}
                  className="text-xs text-purple-700 font-semibold hover:underline"
                >
                  View All &rarr;
                </button>
              </h3>
              <div className="divide-y divide-slate-100 text-xs">
                {bookings.slice(0, 3).map((b) => (
                  <div key={b.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">{b.catererBusinessName || 'Caterer'}</div>
                      <div className="text-slate-500">Host: {b.customerName || 'Customer'} • {b.guestCount} guests</div>
                    </div>
                    <span className="font-bold text-slate-900">
                      {b.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between">
                <span>Caterer Verification Status</span>
                <button
                  onClick={() => setActiveTab('caterers')}
                  className="text-xs text-purple-700 font-semibold hover:underline"
                >
                  Review Queue &rarr;
                </button>
              </h3>
              <div className="divide-y divide-slate-100 text-xs">
                {caterers.slice(0, 3).map((c) => (
                  <div key={c.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">{c.businessName}</div>
                      <div className="text-slate-500 font-mono">FSSAI: {c.fssaiNumber}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        c.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {c.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'caterers' && (
        <PendingCatererQueue
          caterers={caterers as any}
          onStatusChange={handleStatusChange as any}
        />
      )}

      {activeTab === 'bookings' && (
        <AdminBookingsList
          bookings={bookings}
          loading={loading}
          onCancelDispute={handleCancelDispute}
        />
      )}

      {activeTab === 'settlements' && (
        <AdminSettlementsList
          settlements={settlements}
          loading={loading}
          onDisburse={handleDisburse}
        />
      )}

      {activeTab === 'settings' && (
        <CommissionSettingsCard
          initialCommission={commissionPct}
          caterers={caterers}
          onUpdated={(newVal) => setCommissionPct(newVal)}
        />
      )}
    </div>
  );
};
