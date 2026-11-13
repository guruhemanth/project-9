import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { Clock, CheckCircle2, Utensils, FileText, Calendar as CalendarIcon, MessageSquare, Settings, Loader2 } from 'lucide-react';
import { formatPaiseToINR } from '@/lib/formatters';
import { fetchCatererSettlements } from '@/features/payment/api';
import { fetchCatererBookings, fetchCurrentCaterer, fetchCatererByOwner, acceptBooking, rejectBooking } from './api';
import { CatererOnboardingForm } from './components/CatererOnboardingForm';
import { PackageList } from './components/PackageList';
import { CreatePackageModal } from './components/CreatePackageModal';
import { IncomingRequestsQueue } from './components/IncomingRequestsQueue';
import { BlackoutDateManager } from './components/BlackoutDateManager';
import { MenuItemsManager } from './components/MenuItemsManager';
import { CatererOrderSettings } from './components/CatererOrderSettings';
import { PartnerChatHub } from '@/features/chat/PartnerChatHub';
import type { Caterer, Package, PackageItem, Booking } from '@/types/database';

export const CatererDashboard: React.FC = () => {
  const { user } = useAuth();

  const [caterer, setCaterer] = useState<Caterer | null>(null);
  const [packages, setPackages] = useState<(Package & { items: PackageItem[] })[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<Booking[]>([]);
  const [loadingCaterer, setLoadingCaterer] = useState(true);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'requests' | 'packages' | 'menu_items' | 'messages' | 'policies' | 'calendar' | 'earnings'
  >('requests');
  const [settlementData, setSettlementData] = useState<any>(null);

  // Load authenticated caterer profile and packages dynamically
  useEffect(() => {
    let isMounted = true;
    async function loadCatererProfile() {
      if (!user) {
        setLoadingCaterer(false);
        return;
      }
      setLoadingCaterer(true);
      try {
        let res;
        try {
          res = await fetchCurrentCaterer();
        } catch (meErr) {
          if (user.id) {
            res = await fetchCatererByOwner(user.id);
          } else {
            throw meErr;
          }
        }

        if (isMounted && res?.caterer) {
          setCaterer(res.caterer);
          if (res.packages && Array.isArray(res.packages)) {
            setPackages(res.packages);
          }
        }
      } catch (err) {
        console.warn('No active caterer profile found for this user, prompting onboarding:', err);
        if (isMounted) {
          setCaterer(null);
        }
      } finally {
        if (isMounted) {
          setLoadingCaterer(false);
        }
      }
    }

    loadCatererProfile();
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const loadBookings = useCallback(async () => {
    if (!caterer?.id) return;
    try {
      const res = await fetchCatererBookings(caterer.id);
      if (res && Array.isArray(res.bookings)) {
        setIncomingRequests(res.bookings);
      }
    } catch (err) {
      console.error('Failed to load caterer bookings:', err);
    }
  }, [caterer?.id]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    if (caterer?.id && activeTab === 'earnings') {
      fetchCatererSettlements(caterer.id)
        .then((res) => setSettlementData(res))
        .catch(() => {});
    }
  }, [caterer?.id, activeTab]);

  const handleToggleActive = (packageId: string) => {
    setPackages((prev) =>
      prev.map((pkg) => (pkg.id === packageId ? { ...pkg, is_active: !pkg.is_active } : pkg))
    );
  };

  const handlePackageCreated = (newPkg: Package & { items: PackageItem[] }) => {
    setPackages((prev) => [newPkg, ...prev]);
    setShowCreateModal(false);
  };

  const handleAcceptRequest = async (bookingId: string, note?: string) => {
    try {
      await acceptBooking(bookingId, note);
      await loadBookings();
    } catch (err) {
      console.error('Failed to accept booking via API, applying local update:', err);
      setIncomingRequests((prev) =>
        prev.map((r) =>
          r.id === bookingId
            ? {
                ...r,
                status: 'accepted',
                commission_pct: 15.00,
                commission_amount: Math.round(((r.total_amount || 0) * 15) / 100),
                caterer_note: note || 'Accepted by caterer',
                updated_at: new Date().toISOString(),
              }
            : r
        )
      );
    }
  };

  const handleRejectRequest = async (bookingId: string, note?: string) => {
    try {
      await rejectBooking(bookingId, note);
      await loadBookings();
    } catch (err) {
      console.error('Failed to reject booking via API, applying local update:', err);
      setIncomingRequests((prev) =>
        prev.map((r) =>
          r.id === bookingId
            ? {
                ...r,
                status: 'rejected',
                caterer_note: note || 'Declined due to scheduling',
                updated_at: new Date().toISOString(),
              }
            : r
        )
      );
    }
  };

  if (loadingCaterer) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <span className="text-xs font-semibold text-slate-500">Loading your catering business profile...</span>
      </div>
    );
  }

  if (!caterer) {
    return (
      <CatererOnboardingForm
        ownerId={user?.id || 'mock-owner'}
        onSuccess={(created) => setCaterer(created)}
      />
    );
  }

  const pendingRequestsCount = incomingRequests.filter((r) => r.status === 'requested').length;

  return (
    <div className="space-y-6">
      {/* Verification Status Banner */}
      {caterer.status === 'pending' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
          <div className="flex items-start sm:items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900">{caterer.business_name}</h1>
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900 uppercase">
                  Pending Verification
                </span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                  {caterer.city}
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                Your FSSAI license (<b>{caterer.fssai_number}</b>) in {caterer.city} is being reviewed by CaterConnect Admin.
              </p>
            </div>
          </div>
        </div>
      )}

      {caterer.status === 'approved' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900">{caterer.business_name}</h1>
                <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5">
                  {caterer.city}
                </span>
              </div>
              <p className="text-xs text-emerald-800">
                Verified FSSAI: {caterer.fssai_number} • Visible to customers in {caterer.city || 'all service areas'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('requests')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs sm:text-sm font-semibold transition ${
            activeTab === 'requests'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>Orders & History ({incomingRequests.length})</span>
          {pendingRequestsCount > 0 && (
            <span className="rounded-full bg-amber-500 text-white text-[10px] px-1.5 py-0.2 font-bold animate-pulse">
              {pendingRequestsCount} new
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('packages')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs sm:text-sm font-semibold transition ${
            activeTab === 'packages'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Utensils className="h-4 w-4" />
          <span>Combo Packages ({packages.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('menu_items')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs sm:text-sm font-semibold transition ${
            activeTab === 'menu_items'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Utensils className="h-4 w-4 text-amber-600" />
          <span>Master Dishes Catalog</span>
        </button>
        <button
          onClick={() => setActiveTab('messages')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs sm:text-sm font-semibold transition ${
            activeTab === 'messages'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <MessageSquare className="h-4 w-4 text-amber-600" />
          <span>Customer Chats</span>
        </button>
        <button
          onClick={() => setActiveTab('policies')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs sm:text-sm font-semibold transition ${
            activeTab === 'policies'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Settings className="h-4 w-4" />
          <span>Order Policies</span>
        </button>
        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs sm:text-sm font-semibold transition ${
            activeTab === 'calendar'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <CalendarIcon className="h-4 w-4" />
          <span>Calendar & Blackout Dates</span>
        </button>
        <button
          onClick={() => setActiveTab('earnings')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs sm:text-sm font-semibold transition ${
            activeTab === 'earnings'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Earnings & History</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'requests' && (
        <IncomingRequestsQueue
          requests={incomingRequests}
          onAccept={handleAcceptRequest}
          onReject={handleRejectRequest}
        />
      )}

      {activeTab === 'packages' && (
        <PackageList
          packages={packages}
          onAddPackageClick={() => setShowCreateModal(true)}
          onToggleActive={handleToggleActive}
        />
      )}

      {activeTab === 'menu_items' && (
        <MenuItemsManager catererId={caterer.id} />
      )}

      {activeTab === 'messages' && (
        <PartnerChatHub />
      )}

      {activeTab === 'policies' && (
        <CatererOrderSettings
          catererId={caterer.id}
          initialMinGuests={caterer.min_guests}
          initialMaxGuests={caterer.max_guests}
          initialLeadDays={caterer.lead_time_days}
          initialAllowsCustomCombo={caterer.allows_custom_combo}
        />
      )}

      {activeTab === 'calendar' && (
        <BlackoutDateManager catererId={caterer.id} />
      )}

      {activeTab === 'earnings' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900">Earnings & Payout Ledger</h2>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <span className="text-xs text-slate-500">Gross Sales</span>
                <div className="text-xl font-bold text-slate-900 mt-1">
                  {formatPaiseToINR(settlementData?.summary?.totalGrossPaise || 0)}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <span className="text-xs text-slate-500">Platform Fees (15%)</span>
                <div className="text-xl font-bold text-red-600 mt-1">
                  {formatPaiseToINR(settlementData?.summary?.totalCommissionPaise || 0)}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <span className="text-xs text-slate-500">Net Earned</span>
                <div className="text-xl font-bold text-emerald-600 mt-1">
                  {formatPaiseToINR(settlementData?.summary?.totalNetPayoutPaise || 0)}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <span className="text-xs text-slate-500">Disbursed to Bank</span>
                <div className="text-xl font-bold text-purple-600 mt-1">
                  {formatPaiseToINR(settlementData?.summary?.totalDisbursedPaise || 0)}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Settlement Transactions</h3>
            {settlementData?.settlements && settlementData.settlements.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="pb-2">Booking ID</th>
                      <th className="pb-2">Gross</th>
                      <th className="pb-2">Commission (15%)</th>
                      <th className="pb-2">Net Payout</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">UTR Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {settlementData.settlements.map((s: any) => (
                      <tr key={s.id} className="text-slate-700">
                        <td className="py-2.5 font-mono text-[11px] text-slate-500">{s.bookingId.substring(0, 8)}...</td>
                        <td className="py-2.5 font-medium">{formatPaiseToINR(s.grossAmountPaise)}</td>
                        <td className="py-2.5 text-red-600">-{formatPaiseToINR(s.commissionAmountPaise)}</td>
                        <td className="py-2.5 font-bold text-emerald-600">{formatPaiseToINR(s.netPayoutPaise)}</td>
                        <td className="py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              s.status === 'settled'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-[11px] text-slate-500">
                          {s.utrReference || 'Awaiting batch'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-4 text-center">
                No settlements recorded yet. Completed orders will appear in your financial ledger.
              </p>
            )}
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreatePackageModal
          catererId={caterer.id}
          onClose={() => setShowCreateModal(false)}
          onCreated={handlePackageCreated}
        />
      )}
    </div>
  );
};
