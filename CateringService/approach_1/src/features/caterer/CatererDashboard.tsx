import React, { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { Clock, CheckCircle2, Utensils, FileText } from 'lucide-react';
import { formatPaiseToINR } from '@/lib/formatters';
import { CatererOnboardingForm } from './components/CatererOnboardingForm';
import { PackageList } from './components/PackageList';
import { CreatePackageModal } from './components/CreatePackageModal';
import { IncomingRequestsQueue } from './components/IncomingRequestsQueue';
import type { Caterer, Package, PackageItem, Booking } from '@/types/database';

export const CatererDashboard: React.FC = () => {
  const { user } = useAuth();

  const [caterer, setCaterer] = useState<Caterer | null>({
    id: 'd0000000-0000-0000-0000-000000000001',
    owner_id: user?.id || 'c0000000-0000-0000-0000-000000000002',
    business_name: 'Sri Venkateswara Catering Services',
    description: 'Authentic Andhra & South Indian traditional wedding and event feasts in Tirupati.',
    city: 'Tirupati',
    service_areas: ['Alipiri', 'MR Palli', 'Bhavani Nagar', 'Chandragiri', 'Renigunta'],
    cuisines: ['andhra', 'south_indian', 'traditional_meals'],
    fssai_number: '10123000004567',
    gst_number: '37AAAAA0000A1Z5',
    status: 'approved',
    rejection_reason: null,
    avg_rating: 4.8,
    review_count: 12,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const [packages, setPackages] = useState<(Package & { items: PackageItem[] })[]>([
    {
      id: 'e0000000-0000-0000-0000-000000000001',
      caterer_id: 'd0000000-0000-0000-0000-000000000001',
      name: 'Grand Tirupati Wedding Feast',
      description: 'Full traditional 18-course meal served on fresh plantain leaf with Tirupati Laddu sweet.',
      price_per_plate: 35000,
      min_guests: 50,
      max_guests: 1000,
      is_veg: true,
      is_active: true,
      created_at: new Date().toISOString(),
      items: [
        { id: '1', package_id: 'e1', name: 'Poori & Potato Masala', category: 'starter' },
        { id: '2', package_id: 'e1', name: 'Gutti Vankaya Curry', category: 'main' },
        { id: '3', package_id: 'e1', name: 'Andhra Tomato Pappu with Ghee', category: 'main' },
        { id: '4', package_id: 'e1', name: 'Tirupati Style Besan Laddu', category: 'dessert' },
      ],
    },
  ]);

  const [incomingRequests, setIncomingRequests] = useState<Booking[]>([
    {
      id: 'b0000000-0000-0000-0000-000000000001',
      customer_id: 'c0000000-0000-0000-0000-000000000001',
      caterer_id: 'd0000000-0000-0000-0000-000000000001',
      package_id: 'e0000000-0000-0000-0000-000000000001',
      event_date: '2026-11-20',
      event_time: '12:30:00',
      guest_count: 100,
      venue_address: 'MR Palli Community Hall, Tirupati',
      city: 'Tirupati',
      special_requests: 'Extra ghee for sambar and rasam',
      status: 'requested',
      total_amount: 3500000,
      commission_pct: null,
      commission_amount: null,
      caterer_note: null,
      cancelled_by: null,
      cancel_reason: null,
      refund_amount: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'requests' | 'packages' | 'earnings'>('requests');

  const handleToggleActive = (packageId: string) => {
    setPackages((prev) =>
      prev.map((pkg) => (pkg.id === packageId ? { ...pkg, is_active: !pkg.is_active } : pkg))
    );
  };

  const handlePackageCreated = (newPkg: Package & { items: PackageItem[] }) => {
    setPackages((prev) => [newPkg, ...prev]);
    setShowCreateModal(false);
  };

  const handleAcceptRequest = (bookingId: string, note?: string) => {
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
  };

  const handleRejectRequest = (bookingId: string, note?: string) => {
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
  };

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
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                Your FSSAI license (<b>{caterer.fssai_number}</b>) is being reviewed by CaterConnect Admin.
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
              <h1 className="text-base font-bold text-slate-900">{caterer.business_name}</h1>
              <p className="text-xs text-emerald-800">
                Verified FSSAI: {caterer.fssai_number} • Visible to customers in Tirupati
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
          <span>Incoming Requests ({pendingRequestsCount})</span>
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
          <span>Menu Packages ({packages.length})</span>
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

      {activeTab === 'earnings' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900">Earnings Summary</h2>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
              <span className="text-xs text-slate-500">Total Bookings Completed</span>
              <div className="text-xl font-bold text-slate-900 mt-1">0</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
              <span className="text-xs text-slate-500">Gross Sales</span>
              <div className="text-xl font-bold text-slate-900 mt-1">{formatPaiseToINR(0)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
              <span className="text-xs text-slate-500">Net Caterer Payouts</span>
              <div className="text-xl font-bold text-emerald-600 mt-1">{formatPaiseToINR(0)}</div>
            </div>
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
