import React, { useState } from 'react';
import {
  Clock,
  Check,
  X,
  Calendar,
  MapPin,
  CheckCircle2,
  MessageSquare,
  User,
  Phone,
  Utensils,
  CreditCard,
  Users,
  Search,
  Sparkles,
} from 'lucide-react';
import { formatPaiseToINR, formatIndianDate } from '@/lib/formatters';
import { PartnerChatDrawer } from '@/features/chat/PartnerChatDrawer';
import type { Booking } from '@/types/database';

interface Props {
  requests: Booking[];
  onAccept: (bookingId: string, note?: string) => void;
  onReject: (bookingId: string, note?: string) => void;
  onComplete?: (bookingId: string) => void;
}

export const IncomingRequestsQueue: React.FC<Props> = ({
  requests,
  onAccept,
  onReject,
  onComplete,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'accept' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const [chatBooking, setChatBooking] = useState<any | null>(null);

  const [filterTab, setFilterTab] = useState<
    'all' | 'requested' | 'accepted' | 'paid' | 'completed' | 'cancelled'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');

  const handleConfirm = () => {
    if (!selectedId || !actionType) return;
    if (actionType === 'accept') {
      onAccept(selectedId, note.trim() || undefined);
    } else {
      onReject(selectedId, note.trim() || undefined);
    }
    setSelectedId(null);
    setActionType(null);
    setNote('');
  };

  const pendingCount = requests.filter((r) => r.status === 'requested').length;
  const awaitingPaymentCount = requests.filter((r) => r.status === 'accepted').length;
  const paidCount = requests.filter((r) => r.status === 'paid').length;
  const completedCount = requests.filter((r) => r.status === 'completed').length;
  const cancelledCount = requests.filter(
    (r) => r.status === 'cancelled' || r.status === 'rejected'
  ).length;

  const filteredRequests = requests.filter((r) => {
    if (filterTab === 'requested' && r.status !== 'requested') return false;
    if (filterTab === 'accepted' && r.status !== 'accepted') return false;
    if (filterTab === 'paid' && r.status !== 'paid') return false;
    if (filterTab === 'completed' && r.status !== 'completed') return false;
    if (filterTab === 'cancelled' && r.status !== 'cancelled' && r.status !== 'rejected') return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchesName = (r.customer_name || '').toLowerCase().includes(q);
    const matchesPhone = (r.customer_phone || '').includes(q);
    const matchesId = r.id.toLowerCase().includes(q);
    const matchesVenue = (r.venue_address || '').toLowerCase().includes(q);
    const matchesPkg = ((r as any).package_name || (r as any).custom_combo_name || '').toLowerCase().includes(q);
    return matchesName || matchesPhone || matchesId || matchesVenue || matchesPkg;
  });

  const getPaymentStatusBadge = (r: any) => {
    switch (r.status) {
      case 'requested':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            <Clock className="h-3 w-3" /> Awaiting Your Acceptance
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-800 border border-yellow-200">
            <CreditCard className="h-3 w-3" /> Awaiting Customer Payment
          </span>
        );
      case 'paid':
        if (r.payment_type === 'advance') {
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-800">
              <Sparkles className="h-3 w-3 text-teal-600" /> 25% Advance Received (Deal Locked)
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
            <CheckCircle2 className="h-3 w-3" /> 100% Fully Paid
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-800">
            <CheckCircle2 className="h-3 w-3" /> Event Completed
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
            <X className="h-3 w-3" /> Declined by You
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
            Cancelled
          </span>
        );
      default:
        return <span className="text-xs font-medium text-slate-500 capitalize">{r.status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-100 gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span>Orders & Bookings History</span>
            <span className="rounded-full bg-slate-100 text-slate-700 text-xs px-2.5 py-0.5 font-bold">
              {requests.length} Total
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage incoming requests, track advance payments, inspect custom combo recipes, and mark completed events.
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search client, phone, booking #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-xs focus:bg-white focus:outline-none focus:border-emerald-500 transition"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-slate-200">
        {[
          { id: 'all', label: `All Orders (${requests.length})` },
          { id: 'requested', label: `New Requests (${pendingCount})`, highlight: pendingCount > 0 },
          { id: 'accepted', label: `Awaiting Payment (${awaitingPaymentCount})` },
          { id: 'paid', label: `Paid & Confirmed (${paidCount})` },
          { id: 'completed', label: `Completed (${completedCount})` },
          { id: 'cancelled', label: `Cancelled / Declined (${cancelledCount})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterTab(tab.id as any)}
            className={`border-b-2 px-3.5 py-2 text-xs font-bold transition shrink-0 ${
              filterTab === tab.id
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            } ${tab.highlight ? 'text-amber-700' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Orders List */}
      {filteredRequests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center space-y-2">
          <Clock className="mx-auto h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">No orders match this category</p>
          <p className="text-xs text-slate-400">
            {filterTab === 'requested'
              ? 'You have responded to all new customer requests.'
              : 'Incoming customer inquiries and booked feasts will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((req: any) => {
            const totalPaise = req.total_amount_paise || req.total_amount || 0;
            const paidPaise = req.amount_paid_paise || req.amount_paid || 0;
            const balancePaise = req.balance_due_paise || req.balance_due || Math.max(0, totalPaise - paidPaise);
            const commissionPaise = req.commission_amount_paise || req.commission_amount || Math.round(totalPaise * 0.15);
            const netPayoutPaise = Math.max(0, totalPaise - commissionPaise);

            // Parse customized items if present
            let parsedItems: any[] = [];
            if (Array.isArray(req.customized_items)) {
              parsedItems = req.customized_items;
            } else if (typeof req.customized_items === 'string') {
              try {
                parsedItems = JSON.parse(req.customized_items);
              } catch (_) {}
            }

            return (
              <div
                key={req.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col gap-4 hover:shadow-md transition"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-100 gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-900">
                      Booking #{req.id.substring(0, 8)}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs font-semibold text-slate-700">
                      {req.package_name || req.custom_combo_name || 'Catering Feast'}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-xs text-slate-600">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      {req.guest_count} People
                    </span>
                  </div>

                  <div>{getPaymentStatusBadge(req)}</div>
                </div>

                {/* Content Body */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Left Column: Customer & Event Logistics */}
                  <div className="lg:col-span-2 space-y-3">
                    {/* Customer Identification */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                      <span className="flex items-center gap-1.5 font-bold text-slate-900">
                        <User className="h-3.5 w-3.5 text-slate-500" />
                        {req.customer_name || 'Client'}
                      </span>
                      {req.customer_phone && (
                        <span className="flex items-center gap-1 text-slate-600">
                          <Phone className="h-3 w-3 text-slate-400" />
                          <a
                            href={`tel:${req.customer_phone}`}
                            className="hover:underline font-semibold text-emerald-700"
                          >
                            {req.customer_phone}
                          </a>
                        </span>
                      )}
                      {req.customer_email && (
                        <span className="text-slate-400 text-[11px] truncate">
                          ({req.customer_email})
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        Event Date: <b>{formatIndianDate(req.event_date)}</b> at {req.event_time}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" />
                        <span>{req.venue_address}</span>
                      </span>
                    </div>

                    {/* Customized Dishes Pill List for Kitchen Staff */}
                    {parsedItems.length > 0 && (
                      <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-900">
                          <Utensils className="h-3.5 w-3.5 text-amber-700" />
                          <span>Customer Customized Dish Selections ({parsedItems.length}):</span>
                        </div>
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                          {parsedItems.map((item: any, idx: number) => (
                            <span
                              key={item.id || idx}
                              className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-amber-200 shadow-2xs"
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  item.isVeg || item.is_veg ? 'bg-emerald-500' : 'bg-red-500'
                                }`}
                              />
                              {item.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {req.special_requests && (
                      <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <b className="text-slate-800">Special Host Instructions:</b> {req.special_requests}
                      </p>
                    )}

                    {req.caterer_note && (
                      <div className="rounded-lg bg-emerald-50/70 p-2 text-xs text-emerald-900 border border-emerald-100">
                        <b>Your Note to Customer:</b> {req.caterer_note}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Financial & Payment Status Breakdown */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2.5 flex flex-col justify-between">
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Gross Order Total:</span>
                        <span className="font-extrabold text-sm text-slate-900">
                          {formatPaiseToINR(totalPaise)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-600">
                        <span>Advance Collected:</span>
                        <span className="font-bold text-emerald-700">
                          {formatPaiseToINR(paidPaise)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-600">
                        <span>Balance to Collect on Site:</span>
                        <span className="font-bold text-amber-800">
                          {formatPaiseToINR(balancePaise)}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-slate-500 text-[11px]">
                        <span>Platform Fee (15%):</span>
                        <span className="text-red-600">-{formatPaiseToINR(commissionPaise)}</span>
                      </div>

                      <div className="flex items-center justify-between font-bold text-xs text-emerald-900 bg-emerald-100/60 p-1.5 rounded-lg">
                        <span>Net Caterer Payout:</span>
                        <span>{formatPaiseToINR(netPayoutPaise)}</span>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setChatBooking(req)}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition shadow-2xs"
                        title="Chat with event host"
                      >
                        <MessageSquare className="h-3.5 w-3.5 text-amber-700" />
                        <span>Chat</span>
                      </button>

                      {req.status === 'requested' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(req.id);
                              setActionType('accept');
                            }}
                            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>Accept</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(req.id);
                              setActionType('reject');
                            }}
                            className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span>Reject</span>
                          </button>
                        </>
                      )}

                      {req.status === 'paid' && onComplete && (
                        <button
                          type="button"
                          onClick={() => onComplete(req.id)}
                          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition shadow-2xs"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Mark Event Completed</span>
                        </button>
                      )}
                    </div>

                    {/* Action Note Dialog */}
                    {selectedId === req.id && (
                      <div className="w-full mt-2 rounded-xl bg-white p-3 border border-slate-200 space-y-2 shadow-sm animate-in fade-in duration-100">
                        <span className="block text-xs font-bold capitalize text-slate-800">
                          {actionType} Booking Request
                        </span>
                        <input
                          type="text"
                          placeholder={
                            actionType === 'accept'
                              ? 'Optional note for customer (e.g. Menu confirmed, we look forward to serving your feast)'
                              : 'Reason for rejection (e.g. Kitchen fully booked for this date)'
                          }
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 py-1.5 px-3 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedId(null)}
                            className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleConfirm}
                            className={`rounded-lg px-3 py-1 text-xs font-semibold text-white transition ${
                              actionType === 'accept'
                                ? 'bg-emerald-600 hover:bg-emerald-700'
                                : 'bg-red-600 hover:bg-red-700'
                            }`}
                          >
                            Confirm {actionType === 'accept' ? 'Acceptance' : 'Rejection'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Real-time In-App Chat Drawer */}
      {chatBooking && (
        <PartnerChatDrawer
          bookingId={chatBooking.id}
          customerName={chatBooking.customer_name || 'Event Host'}
          bookingSummary={{
            venueAddress: chatBooking.venue_address,
            eventDate: chatBooking.event_date,
            guestCount: chatBooking.guest_count,
          }}
          onClose={() => setChatBooking(null)}
        />
      )}
    </div>
  );
};
