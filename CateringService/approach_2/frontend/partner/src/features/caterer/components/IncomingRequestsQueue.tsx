import React, { useState } from 'react';
import { Clock, Check, X, Calendar, MapPin, CheckCircle2, MessageSquare, User, Phone } from 'lucide-react';
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
  const [chatBooking, setChatBooking] = useState<Booking | null>(null);

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

  const pendingRequests = requests.filter((r) => r.status === 'requested');
  const activeBookings = requests.filter((r) => r.status === 'paid' || r.status === 'accepted');

  return (
    <div className="space-y-6">
      {/* Pending Requests Queue */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Incoming Requests ({pendingRequests.length})</h2>
            <p className="text-xs text-slate-500">
              Accept or reject booking requests. Auto-expires after 48 hours without reply.
            </p>
          </div>
        </div>

        {pendingRequests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center">
            <Clock className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-700">No pending requests</p>
            <p className="text-xs text-slate-400">New customer requests in Tirupati will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">Booking #{req.id.slice(0, 8)}</span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      Awaiting Response
                    </span>
                  </div>

                  {/* Customer Identification */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700 bg-slate-50 px-2.5 py-1.5 rounded-md border border-slate-100">
                    <span className="flex items-center gap-1 font-semibold text-slate-900">
                      <User className="h-3.5 w-3.5 text-slate-500" />
                      {req.customer_name || 'Guest Customer'}
                    </span>
                    {req.customer_phone && (
                      <span className="flex items-center gap-1 text-slate-600">
                        <Phone className="h-3 w-3 text-slate-400" />
                        <a href={`tel:${req.customer_phone}`} className="hover:underline text-emerald-700">
                          {req.customer_phone}
                        </a>
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-600 flex flex-wrap gap-4">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <b>{formatIndianDate(req.event_date)}</b> at {req.event_time}
                    </span>
                    <span>
                      Guests: <b>{req.guest_count}</b>
                    </span>
                    {req.total_amount && (
                      <span>
                        Est. Total: <b>{formatPaiseToINR(req.total_amount)}</b>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    <span>{req.venue_address}</span>
                  </div>

                  {req.special_requests && (
                    <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                      <b>Special Requests:</b> {req.special_requests}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
                  <button
                    type="button"
                    onClick={() => setChatBooking(req)}
                    className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition shadow-2xs"
                    title="Message event host"
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-amber-700" />
                    <span>Chat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(req.id);
                      setActionType('accept');
                    }}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Accept Request</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(req.id);
                      setActionType('reject');
                    }}
                    className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Reject</span>
                  </button>
                </div>

                {/* Action Note Dialog */}
                {selectedId === req.id && (
                  <div className="w-full mt-2 rounded-lg bg-slate-50 p-3 border border-slate-200 space-y-2">
                    <span className="block text-xs font-bold capitalize text-slate-800">
                      {actionType} Booking Request
                    </span>
                    <input
                      type="text"
                      placeholder={
                        actionType === 'accept'
                          ? 'Optional note for customer (e.g. Menu confirmed, we look forward to serving you)'
                          : 'Reason for rejection (e.g. Already booked for this date)'
                      }
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 py-1.5 px-3 text-xs bg-white focus:outline-none focus:border-emerald-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedId(null)}
                        className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirm}
                        className={`rounded px-3 py-1 text-xs font-semibold text-white ${
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
            ))}
          </div>
        )}
      </div>

      {/* Active Paid Bookings (Caterer can mark completed on/after event date) */}
      {activeBookings.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Active Bookings ({activeBookings.length})</h2>
          <div className="space-y-3">
            {activeBookings.map((b) => (
              <div
                key={b.id}
                className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
              >
                <div className="text-xs text-slate-700 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">Event on {formatIndianDate(b.event_date)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        b.status === 'paid' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {b.status.toUpperCase()}
                    </span>
                  </div>
                  {/* Customer Identification */}
                  <div className="flex flex-wrap items-center gap-2 text-slate-700">
                    <span className="font-semibold text-slate-900 flex items-center gap-1">
                      <User className="h-3 w-3 text-slate-400" />
                      {b.customer_name || 'Customer'}
                    </span>
                    {b.customer_phone && (
                      <span className="text-slate-500 flex items-center gap-1">
                        • <Phone className="h-3 w-3 text-slate-400" />
                        <a href={`tel:${b.customer_phone}`} className="hover:underline text-emerald-700">
                          {b.customer_phone}
                        </a>
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500">
                    Venue: {b.venue_address} • {b.guest_count} guests • Total: {b.total_amount && formatPaiseToINR(b.total_amount)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setChatBooking(b)}
                    className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition shadow-2xs"
                    title="Message event host"
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-amber-700" />
                    <span>Chat</span>
                  </button>

                  {b.status === 'paid' && onComplete && (
                    <button
                      type="button"
                      onClick={() => onComplete(b.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 transition"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Mark Event Completed</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real-time In-App Chat Drawer */}
      {chatBooking && (
        <PartnerChatDrawer
          bookingId={chatBooking.id}
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
