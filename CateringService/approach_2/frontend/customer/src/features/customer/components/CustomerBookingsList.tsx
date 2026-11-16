import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  MapPin,
  CheckCircle,
  XCircle,
  CreditCard,
  Sparkles,
  Star,
  MessageSquare,
  Users,
  Utensils,
  Receipt,
  RefreshCw,
  AlertCircle,
  Zap,
  Timer,
  RotateCcw,
} from 'lucide-react';
import { formatPaiseToINR, formatIndianDate } from '@/lib/formatters';
import { fetchCustomerBookings, cancelBooking } from '../api';
import { PaymentModal } from '@/features/payment/components/PaymentModal';
import { ReviewModal } from '@/features/reviews/components/ReviewModal';
import { WhatsAppButton } from '@/features/customer/components/WhatsAppButton';
import { ChatDrawer } from '@/features/chat/ChatDrawer';
import type { Booking, Review } from '@/types/database';

export const CustomerBookingsList: React.FC = () => {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'action_needed' | 'paid' | 'completed' | 'cancelled' | 'expired'>('all');

  const [paymentBooking, setPaymentBooking] = useState<any | null>(null);
  const [reviewBooking, setReviewBooking] = useState<any | null>(null);
  const [chatBooking, setChatBooking] = useState<any | null>(null);

  const getRemainingTime = (deadlineStr?: string | null) => {
    if (!deadlineStr) return null;
    const deadline = new Date(deadlineStr).getTime();
    const now = Date.now();
    const diffMs = deadline - now;
    if (diffMs <= 0) return 'Expired';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  };

  const loadBookings = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchCustomerBookings();
      setBookings(res.bookings || []);
    } catch (err: any) {
      console.error('Failed to load customer bookings:', err);
      setError('Unable to load your bookings. Please sign in or refresh.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  const handleCancelBooking = async (bookingId: string) => {
    const reason = window.prompt('Please enter a cancellation reason:', 'Event postponed or cancelled');
    if (!reason) return;

    try {
      await cancelBooking(bookingId, reason);
      await loadBookings();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel booking.');
    }
  };

  const handlePaymentSuccess = (updatedBooking: Booking) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === updatedBooking.id ? { ...b, ...updatedBooking } : b))
    );
    setPaymentBooking(null);
    loadBookings();
  };

  const handleReviewSuccess = (_rev: Review) => {
    if (!reviewBooking) return;
    setBookings((prev) =>
      prev.map((b) => (b.id === reviewBooking.id ? { ...b, reviewed: true } : b))
    );
    setReviewBooking(null);
  };

  const getStatusBadge = (b: any) => {
    switch (b.status) {
      case 'requested':
        if (b.booking_mode === 'instant') {
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 border border-amber-300">
              <Zap className="h-3 w-3 fill-amber-500 text-amber-600" /> Instant Book • Pay Advance
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            <Clock className="h-3 w-3" /> Under Review • ₹0 Paid
          </span>
        );
      case 'accepted': {
        const timeLeft = getRemainingTime(b.payment_deadline);
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-900 border border-emerald-300 animate-pulse">
            <Timer className="h-3.5 w-3.5 text-emerald-700" /> Accepted • Pay Advance ({timeLeft || '12h'})
          </span>
        );
      }
      case 'paid':
        if (b.payment_type === 'advance') {
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-800">
              <Sparkles className="h-3 w-3 text-teal-600" /> Deal Locked (25% Advance Paid)
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
            <CheckCircle className="h-3 w-3" /> Fully Paid & Confirmed
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-800">
            <CheckCircle className="h-3 w-3" /> Feast Completed
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
            <XCircle className="h-3 w-3" /> Declined by Caterer
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
            {b.refund_id ? 'Cancelled (100% Refunded)' : 'Cancelled'}
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 border border-slate-200">
            <Clock className="h-3 w-3 text-slate-400" /> Expired (Unpaid)
          </span>
        );
      default:
        return <span className="text-xs font-medium text-slate-500 capitalize">{b.status}</span>;
    }
  };

  const filteredBookings = bookings.filter((b) => {
    if (filterTab === 'all') return true;
    if (filterTab === 'action_needed') return b.status === 'accepted';
    if (filterTab === 'paid') return b.status === 'paid';
    if (filterTab === 'completed') return b.status === 'completed';
    if (filterTab === 'cancelled') return b.status === 'cancelled' || b.status === 'rejected';
    if (filterTab === 'expired') return b.status === 'expired';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="h-6 w-6 text-emerald-600" />
            <span>My Orders & Bookings History</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time status of catering requests, custom combos, live payment tracking, and reviews.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadBookings}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
            title="Refresh bookings"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <Link
            to="/"
            className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 shadow-2xs transition"
          >
            Explore Caterers
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-slate-200">
        {[
          { id: 'all', label: `All Orders (${bookings.length})` },
          { id: 'action_needed', label: `Payment Needed (${bookings.filter((b) => b.status === 'accepted').length})` },
          { id: 'paid', label: `Confirmed & Paid (${bookings.filter((b) => b.status === 'paid').length})` },
          { id: 'completed', label: `Completed (${bookings.filter((b) => b.status === 'completed').length})` },
          { id: 'cancelled', label: `Cancelled` },
          { id: 'expired', label: `Expired (${bookings.filter((b) => b.status === 'expired').length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterTab(tab.id as any)}
            className={`border-b-2 px-3.5 py-2 text-xs font-bold transition shrink-0 ${
              filterTab === tab.id
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-400">
          Loading your order history...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-xs text-red-700 flex items-center justify-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center bg-white space-y-3">
          <Calendar className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="text-sm font-bold text-slate-800">No catering orders found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            You don't have any bookings under this filter. Browse verified caterers to request an authentic feast.
          </p>
          <Link
            to="/"
            className="inline-block rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
          >
            Browse Caterers
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((booking) => {
            const totalPaise = booking.total_amount_paise || booking.total_amount || 0;
            const paidPaise = booking.amount_paid_paise || booking.amount_paid || 0;
            const balancePaise = booking.balance_due_paise || booking.balance_due || (totalPaise - paidPaise);

            // Parse customized items if present
            let parsedItems: any[] = [];
            if (Array.isArray(booking.customized_items)) {
              parsedItems = booking.customized_items;
            } else if (typeof booking.customized_items === 'string') {
              try {
                parsedItems = JSON.parse(booking.customized_items);
              } catch (_) {}
            }

            return (
              <div
                key={booking.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col gap-4 hover:shadow-md transition"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-900">
                      Order #{booking.id.substring(0, 8)}
                    </span>
                    <span className="text-slate-300">•</span>
                    {booking.booking_mode === 'instant' ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300">
                        <Zap className="h-3 w-3 fill-amber-500 text-amber-600" /> Instant Book
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200">
                        On-Request
                      </span>
                    )}
                    <span className="text-slate-300">•</span>
                    <h3 className="text-sm font-bold text-slate-900">
                      {booking.business_name || booking.caterer_name}
                    </h3>
                    <span className="text-xs text-slate-500">
                      ({booking.caterer_city || booking.city || 'India'})
                    </span>
                  </div>

                  <div>{getStatusBadge(booking)}</div>
                </div>

                {/* Main Content Body */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Left Column: Event & Service Details */}
                  <div className="lg:col-span-2 space-y-3">
                    <div className="flex items-center gap-3 text-xs text-slate-700 flex-wrap">
                      <span className="font-bold text-emerald-950 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">
                        {booking.package_name || booking.custom_combo_name || 'Catering Package'}
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold bg-slate-100 px-2.5 py-1 rounded-md text-slate-800">
                        <Users className="h-3.5 w-3.5 text-slate-500" />
                        {booking.guest_count} People for Service
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <b>{formatIndianDate(booking.event_date)}</b> at {booking.event_time}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" />
                        <span>{booking.venue_address}</span>
                      </span>
                    </div>

                    {/* Payment Window Countdown for Accepted Bookings */}
                    {booking.status === 'accepted' && (
                      <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-3.5 space-y-1.5 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                            <Timer className="h-4 w-4 text-emerald-700 animate-pulse" />
                            12-Hour Payment Window Open
                          </span>
                          {booking.payment_deadline && (
                            <span className="text-[11px] font-bold text-emerald-800 bg-emerald-200/70 px-2 py-0.5 rounded-full">
                              {getRemainingTime(booking.payment_deadline) || 'Deadline reached'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-emerald-900 leading-relaxed">
                          Great news! <b>{booking.business_name || booking.caterer_name}</b> accepted your booking request. Your event slot is tentatively held. Pay the <strong>25% advance ({formatPaiseToINR(Math.round(totalPaise * 0.25))})</strong> before the timer expires to confirm and lock your date!
                        </p>
                      </div>
                    )}

                    {/* Expired Slot Alert */}
                    {booking.status === 'expired' && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-start gap-2.5">
                        <AlertCircle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-slate-600">
                          <span className="font-bold text-slate-800">Booking Expired:</span> Payment was not received within the 12-hour confirmation window. The reserved calendar date was released. You can submit a fresh request at any time.
                        </div>
                      </div>
                    )}

                    {/* Automated Refund Alert */}
                    {booking.refund_id && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-blue-600 shrink-0" />
                        <span>100% Automated Refund Processed (Razorpay ID: <code className="font-mono font-bold">{booking.refund_id}</code>)</span>
                      </div>
                    )}

                    {/* Customized Dishes Pill List */}
                    {parsedItems.length > 0 && (
                      <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-3 space-y-1.5">
                        <div className="flex items-center gap-1 text-[11px] font-bold text-amber-900">
                          <Utensils className="h-3.5 w-3.5 text-amber-700" />
                          <span>Customized Dishes Included ({parsedItems.length}):</span>
                        </div>
                        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                          {parsedItems.map((item: any, idx: number) => (
                            <span
                              key={item.id || idx}
                              className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-amber-200 shadow-2xs"
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${item.isVeg || item.is_veg ? 'bg-emerald-500' : 'bg-red-500'}`} />
                              {item.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {booking.special_requests && (
                      <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <b className="text-slate-800">Special Notes:</b> {booking.special_requests}
                      </p>
                    )}

                    {booking.caterer_note && (
                      <div className="rounded-lg bg-emerald-50/70 p-2.5 text-xs text-emerald-900 border border-emerald-100">
                        <b>Caterer Response:</b> {booking.caterer_note}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Financial & Payment Status Ledger */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Total Event Cost</span>
                        <span className="font-extrabold text-sm text-slate-900">
                          {formatPaiseToINR(totalPaise)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-600">
                        <span>Amount Paid</span>
                        <span className="font-bold text-emerald-700">
                          {formatPaiseToINR(paidPaise)}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-bold">
                        <span className="text-slate-700">Balance Due on Event</span>
                        <span className="text-amber-800">
                          {formatPaiseToINR(Math.max(0, balancePaise))}
                        </span>
                      </div>

                      {booking.payment_type && (
                        <div className="pt-1 text-[11px] text-slate-500 font-medium capitalize">
                          Payment Option: <b>{booking.payment_type} Payment</b>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setChatBooking(booking)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 transition shadow-2xs"
                      >
                        <MessageSquare className="h-3.5 w-3.5 text-emerald-700" />
                        <span>Chat</span>
                      </button>

                      {booking.phone && (
                        <WhatsAppButton
                          phone={booking.phone}
                          businessName={booking.business_name || booking.caterer_name}
                          eventDate={booking.event_date}
                        />
                      )}

                      {booking.status === 'accepted' && (
                        <button
                          type="button"
                          onClick={() => setPaymentBooking(booking)}
                          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition animate-pulse"
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                          <span>⚡ Pay 25% Advance ({formatPaiseToINR(Math.round(totalPaise * 0.25))})</span>
                        </button>
                      )}

                      {booking.status === 'requested' && booking.booking_mode === 'instant' && (
                        <button
                          type="button"
                          onClick={() => setPaymentBooking(booking)}
                          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 shadow-xs transition"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          <span>⚡ Pay 25% Advance (Instant Lock)</span>
                        </button>
                      )}

                      {booking.status === 'requested' && booking.booking_mode !== 'instant' && (
                        <div className="w-full text-center py-2 px-3 rounded-lg bg-amber-50 text-amber-800 text-[11px] font-semibold border border-amber-200">
                          Awaiting Caterer Review (₹0 Due Now)
                        </div>
                      )}

                      {booking.status === 'expired' && (
                        <Link
                          to={`/caterers/${booking.caterer_id}`}
                          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                        >
                          <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                          <span>Re-book with Caterer</span>
                        </Link>
                      )}

                      {booking.status === 'requested' && (
                        <button
                          type="button"
                          onClick={() => handleCancelBooking(booking.id)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                        >
                          Cancel Request
                        </button>
                      )}

                      {booking.status === 'completed' && !booking.reviewed && (
                        <button
                          type="button"
                          onClick={() => setReviewBooking(booking)}
                          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-600 shadow-xs transition"
                        >
                          <Star className="h-3.5 w-3.5 fill-current" />
                          <span>Rate Caterer Feast</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Payment Modal */}
      {paymentBooking && (
        <PaymentModal
          booking={{
            ...paymentBooking,
            caterer_name: paymentBooking.business_name || paymentBooking.caterer_name,
            package_name: paymentBooking.package_name || paymentBooking.custom_combo_name,
          }}
          onClose={() => setPaymentBooking(null)}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      {/* Review Modal */}
      {reviewBooking && (
        <ReviewModal
          bookingId={reviewBooking.id}
          catererId={reviewBooking.caterer_id}
          customerId={reviewBooking.customer_id}
          catererName={reviewBooking.business_name || reviewBooking.caterer_name}
          onClose={() => setReviewBooking(null)}
          onSuccess={handleReviewSuccess}
        />
      )}

      {/* Real-time In-App Chat Drawer */}
      {chatBooking && (
        <ChatDrawer
          bookingId={chatBooking.id}
          catererName={chatBooking.business_name || chatBooking.caterer_name}
          bookingSummary={{
            packageName: chatBooking.package_name || chatBooking.custom_combo_name,
            eventDate: chatBooking.event_date,
            guestCount: chatBooking.guest_count,
          }}
          onClose={() => setChatBooking(null)}
        />
      )}
    </div>
  );
};
