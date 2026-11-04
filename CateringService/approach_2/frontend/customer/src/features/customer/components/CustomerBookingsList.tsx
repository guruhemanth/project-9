import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, CheckCircle, XCircle, CreditCard, Sparkles, Star, MessageSquare } from 'lucide-react';
import { formatPaiseToINR, formatIndianDate } from '@/lib/formatters';
import { PaymentModal } from '@/features/payment/components/PaymentModal';
import { ReviewModal } from '@/features/reviews/components/ReviewModal';
import { WhatsAppButton } from '@/features/customer/components/WhatsAppButton';
import { ChatDrawer } from '@/features/chat/ChatDrawer';
import type { Booking, Review } from '@/types/database';

export const CustomerBookingsList: React.FC = () => {
  const [bookings, setBookings] = useState<(Booking & { caterer_name: string; package_name: string; phone?: string; reviewed?: boolean })[]>([
    {
      id: 'b0000000-0000-0000-0000-000000000001',
      customer_id: 'c0000000-0000-0000-0000-000000000001',
      caterer_id: 'd0000000-0000-0000-0000-000000000001',
      caterer_name: 'Sri Venkateswara Catering Services',
      phone: '+919876543211',
      package_id: 'e0000000-0000-0000-0000-000000000001',
      package_name: 'Grand Tirupati Wedding Feast',
      event_date: '2026-11-20',
      event_time: '12:30:00',
      guest_count: 100,
      venue_address: 'MR Palli Community Hall, Tirupati',
      city: 'Tirupati',
      special_requests: 'Extra ghee for sambar and rasam',
      status: 'accepted',
      total_amount: 3500000,
      commission_pct: 15.00,
      commission_amount: 525000,
      caterer_note: 'Accepted! Looking forward to catering your event in Tirupati.',
      cancelled_by: null,
      cancel_reason: null,
      refund_amount: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'b0000000-0000-0000-0000-000000000002',
      customer_id: 'c0000000-0000-0000-0000-000000000001',
      caterer_id: 'd0000000-0000-0000-0000-000000000001',
      caterer_name: 'Sri Venkateswara Catering Services',
      phone: '+919876543211',
      package_id: 'e0000000-0000-0000-0000-000000000001',
      package_name: 'Grand Tirupati Wedding Feast',
      event_date: '2026-10-15',
      event_time: '11:00:00',
      guest_count: 75,
      venue_address: 'Alipiri Kalyana Mandapam, Tirupati',
      city: 'Tirupati',
      special_requests: null,
      status: 'completed',
      total_amount: 2625000,
      amount_paid: 2625000,
      balance_due: 0,
      payment_type: 'full',
      commission_pct: 15.00,
      commission_amount: 393750,
      caterer_note: 'Event completed successfully',
      cancelled_by: null,
      cancel_reason: null,
      refund_amount: 0,
      reviewed: false,
      created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  const [paymentBooking, setPaymentBooking] = useState<(Booking & { caterer_name: string; package_name: string }) | null>(null);
  const [reviewBooking, setReviewBooking] = useState<(Booking & { caterer_name: string; package_name: string }) | null>(null);
  const [chatBooking, setChatBooking] = useState<(Booking & { caterer_name: string; package_name: string }) | null>(null);

  const handleCancelBooking = (bookingId: string) => {
    setBookings((prev) =>
      prev.map((b) =>
        b.id === bookingId
          ? {
              ...b,
              status: 'cancelled',
              cancelled_by: 'customer',
              cancel_reason: 'Cancelled by customer before payment',
            }
          : b
      )
    );
  };

  const handlePaymentSuccess = (updatedBooking: Booking) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === updatedBooking.id ? { ...b, ...updatedBooking } : b))
    );
    setPaymentBooking(null);
  };

  const handleReviewSuccess = (_rev: Review) => {
    if (!reviewBooking) return;
    setBookings((prev) =>
      prev.map((b) => (b.id === reviewBooking.id ? { ...b, reviewed: true } : b))
    );
    setReviewBooking(null);
  };

  const getStatusBadge = (b: Booking) => {
    switch (b.status) {
      case 'requested':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            <Clock className="h-3 w-3" /> Waiting for Caterer
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            <CheckCircle className="h-3 w-3" /> Accepted - Choose Payment
          </span>
        );
      case 'paid':
        if (b.payment_type === 'advance') {
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
              <Sparkles className="h-3 w-3" /> Deal Locked (25% Paid)
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
            <CheckCircle className="h-3 w-3" /> Fully Paid & Confirmed
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800">
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
            Cancelled
          </span>
        );
      default:
        return <span className="text-xs font-medium text-slate-500 capitalize">{b.status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900">My Bookings</h1>
          <p className="text-xs text-slate-500">Track catering requests, payments, and rate completed events</p>
        </div>
        <Link
          to="/"
          className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          Explore More Caterers
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center bg-white">
          <Calendar className="mx-auto h-8 w-8 text-slate-300" />
          <h3 className="mt-2 text-sm font-semibold text-slate-800">No catering bookings yet</h3>
          <p className="text-xs text-slate-500">Browse approved Tirupati caterers to send a booking request.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => (
            <div
              key={booking.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">{booking.caterer_name}</h3>
                  {getStatusBadge(booking)}
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-800">{booking.package_name}</span>
                    <span>• {booking.guest_count} guests</span>
                    {booking.total_amount && (
                      <span className="font-bold text-slate-900">
                        • Total: {formatPaiseToINR(booking.total_amount)}
                      </span>
                    )}
                  </div>

                  {booking.status === 'paid' && booking.payment_type === 'advance' && (
                    <div className="flex items-center gap-2 text-teal-800 font-semibold bg-teal-50 px-2 py-1 rounded inline-flex">
                      <span>Paid Advance: {booking.amount_paid && formatPaiseToINR(booking.amount_paid)}</span>
                      <span>• Balance Due on Event Day: {booking.balance_due && formatPaiseToINR(booking.balance_due)}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" /> {formatIndianDate(booking.event_date)} at {booking.event_time}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {booking.venue_address}
                    </span>
                  </div>
                </div>

                {booking.caterer_note && (
                  <div className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-900 border border-emerald-100">
                    <b>Caterer Note:</b> {booking.caterer_note}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
                <button
                  type="button"
                  onClick={() => setChatBooking(booking)}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-850 hover:bg-emerald-100 transition shadow-2xs"
                  title="Message caterer directly"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-emerald-700" />
                  <span>Chat</span>
                </button>

                {booking.phone && (
                  <WhatsAppButton
                    phone={booking.phone}
                    businessName={booking.caterer_name}
                    eventDate={booking.event_date}
                  />
                )}

                {booking.status === 'requested' && (
                  <button
                    type="button"
                    onClick={() => handleCancelBooking(booking.id)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel Request
                  </button>
                )}

                {booking.status === 'accepted' && (
                  <button
                    type="button"
                    onClick={() => setPaymentBooking(booking)}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs transition"
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    <span>Pay (Full or Advance to Lock Deal)</span>
                  </button>
                )}

                {booking.status === 'completed' && !booking.reviewed && (
                  <button
                    type="button"
                    onClick={() => setReviewBooking(booking)}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 shadow-xs transition"
                  >
                    <Star className="h-3.5 w-3.5 fill-current" />
                    <span>Rate Caterer</span>
                  </button>
                )}

                {booking.status === 'completed' && booking.reviewed && (
                  <span className="text-xs text-slate-500 font-medium">✓ Reviewed</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment Modal */}
      {paymentBooking && (
        <PaymentModal
          booking={paymentBooking}
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
          catererName={reviewBooking.caterer_name}
          onClose={() => setReviewBooking(null)}
          onSuccess={handleReviewSuccess}
        />
      )}

      {/* Real-time In-App Chat Drawer */}
      {chatBooking && (
        <ChatDrawer
          bookingId={chatBooking.id}
          catererName={chatBooking.caterer_name}
          bookingSummary={{
            packageName: chatBooking.package_name,
            eventDate: chatBooking.event_date,
            guestCount: chatBooking.guest_count,
          }}
          onClose={() => setChatBooking(null)}
        />
      )}
    </div>
  );
};
