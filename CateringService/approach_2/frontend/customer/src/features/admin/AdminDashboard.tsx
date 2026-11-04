import React, { useState } from 'react';
import { Shield, Percent } from 'lucide-react';
import { PendingCatererQueue } from './components/PendingCatererQueue';
import { CommissionSettingsCard } from './components/CommissionSettingsCard';
import type { Caterer, CatererStatus } from '@/types/database';

export const AdminDashboard: React.FC = () => {
  const [commissionPct, setCommissionPct] = useState(15.00);

  // Sample data simulating caterers across statuses
  const [caterers, setCaterers] = useState<Caterer[]>([
    {
      id: 'd0000000-0000-0000-0000-000000000001',
      owner_id: 'c0000000-0000-0000-0000-000000000002',
      business_name: 'Sri Venkateswara Catering Services',
      description: 'Authentic Andhra & South Indian traditional wedding feasts in Tirupati.',
      city: 'Tirupati',
      service_areas: ['Alipiri', 'MR Palli', 'Bhavani Nagar', 'Chandragiri', 'Renigunta'],
      cuisines: ['andhra', 'south_indian'],
      fssai_number: '10123000004567',
      gst_number: '37AAAAA0000A1Z5',
      status: 'approved',
      rejection_reason: null,
      avg_rating: 4.8,
      review_count: 12,
      created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'd0000000-0000-0000-0000-000000000004',
      owner_id: 'c0000000-0000-0000-0000-000000000004',
      business_name: 'Rayalaseema Ruchulu Caterers',
      description: 'Authentic spicy Rayalaseema ragi mudda & biryani catering in Tirupati.',
      city: 'Tirupati',
      service_areas: ['AIR Bypass Road', 'Korlagunta', 'Tiruchanur'],
      cuisines: ['rayalaseema', 'andhra'],
      fssai_number: '10124000008899',
      gst_number: null,
      status: 'pending',
      rejection_reason: null,
      avg_rating: 0,
      review_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  const handleStatusChange = (catererId: string, newStatus: CatererStatus, reason?: string) => {
    setCaterers((prev) =>
      prev.map((c) =>
        c.id === catererId
          ? {
              ...c,
              status: newStatus,
              rejection_reason: reason || null,
              updated_at: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const pendingCount = caterers.filter((c) => c.status === 'pending').length;
  const approvedCount = caterers.filter((c) => c.status === 'approved').length;

  return (
    <div className="space-y-6">
      {/* Admin header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-600" />
            <h1 className="text-xl font-bold text-slate-900">Admin Control Panel</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Review caterers in Tirupati, verify FSSAI credentials, and configure platform commissions
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto rounded-lg bg-purple-50 px-3 py-1.5 border border-purple-200 text-xs font-semibold text-purple-800">
          <Percent className="h-3.5 w-3.5" />
          <span>Active Commission: {commissionPct}%</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-xs font-medium text-slate-500">Pending Approvals</span>
          <div className="mt-1 text-2xl font-bold text-amber-600">{pendingCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-xs font-medium text-slate-500">Approved Caterers</span>
          <div className="mt-1 text-2xl font-bold text-slate-900">{approvedCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-xs font-medium text-slate-500">Total Bookings</span>
          <div className="mt-1 text-2xl font-bold text-slate-900">0</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-xs font-medium text-slate-500">Platform Revenue</span>
          <div className="mt-1 text-2xl font-bold text-purple-600">₹0</div>
        </div>
      </div>

      {/* Commission Settings */}
      <CommissionSettingsCard
        initialCommission={commissionPct}
        onUpdated={(newVal) => setCommissionPct(newVal)}
      />

      {/* Pending Caterer Review Queue */}
      <PendingCatererQueue caterers={caterers} onStatusChange={handleStatusChange} />
    </div>
  );
};
