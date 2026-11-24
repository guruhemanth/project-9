import React from 'react';
import { IndianRupee, TrendingUp, CheckCircle, Clock, Users, ShieldAlert } from 'lucide-react';
import { formatPaiseToINR } from '@/lib/formatters';
import type { PlatformAnalytics } from '@caterconnect/shared';

interface Props {
  analytics: PlatformAnalytics | null;
  loading: boolean;
}

export const AdminAnalyticsCards: React.FC<Props> = ({ analytics, loading }) => {
  if (loading || !analytics) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-200" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Financial Health Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* GMV */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Gross Bookings (GMV)</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
              <IndianRupee className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">
            {formatPaiseToINR(analytics.totalGMVPaise)}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            From {analytics.paidBookingsCount} paid event contracts
          </p>
        </div>

        {/* Commission Revenue */}
        <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50/60 to-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider">15% Commission Earned</span>
            <div className="p-2 rounded-lg bg-purple-100 text-purple-800">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-purple-900">
            {formatPaiseToINR(analytics.totalCommissionPaise)}
          </div>
          <p className="mt-1 text-[11px] text-purple-600 font-medium">
            Platform net revenue realized
          </p>
        </div>

        {/* Disbursed Payouts */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Disbursed to Caterers</span>
            <div className="p-2 rounded-lg bg-teal-50 text-teal-700">
              <CheckCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-teal-850">
            {formatPaiseToINR(analytics.totalDisbursedPaise)}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {analytics.settledCount} settlements settled via bank UTR
          </p>
        </div>

        {/* Pending Payouts */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Pending Disbursals</span>
            <div className="p-2 rounded-lg bg-amber-100 text-amber-800">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-amber-900">
            {formatPaiseToINR(analytics.pendingPayoutsPaise)}
          </div>
          <p className="mt-1 text-[11px] text-amber-700">
            {analytics.pendingSettlementCount} caterer payouts awaiting transfer
          </p>
        </div>
      </div>

      {/* Operational Stats Sub-row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="rounded-lg bg-white border border-slate-200 p-3 flex items-center justify-between">
          <span className="text-slate-500">Approved Caterers:</span>
          <span className="font-bold text-slate-900 flex items-center gap-1">
            <Users className="h-3.5 w-3.5 text-emerald-600" />
            {analytics.approvedCaterersCount}
          </span>
        </div>
        <div className="rounded-lg bg-white border border-slate-200 p-3 flex items-center justify-between">
          <span className="text-slate-500">Pending FSSAI Audit:</span>
          <span className="font-bold text-amber-700 flex items-center gap-1">
            <ShieldAlert className="h-3.5 w-3.5" />
            {analytics.pendingCaterersCount}
          </span>
        </div>
        <div className="rounded-lg bg-white border border-slate-200 p-3 flex items-center justify-between">
          <span className="text-slate-500">Total Booking Requests:</span>
          <span className="font-bold text-slate-900">{analytics.totalBookingsCount}</span>
        </div>
        <div className="rounded-lg bg-white border border-slate-200 p-3 flex items-center justify-between">
          <span className="text-slate-500">Paid / Confirmed:</span>
          <span className="font-bold text-emerald-700">{analytics.paidBookingsCount}</span>
        </div>
      </div>
    </div>
  );
};
