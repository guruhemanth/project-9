import React, { useState } from 'react';
import { X, Star, AlertCircle, Check } from 'lucide-react';
import { submitReview } from '../api';
import type { Review } from '@/types/database';

interface Props {
  bookingId: string;
  catererId: string;
  customerId: string;
  catererName: string;
  onClose: () => void;
  onSuccess: (review: Review) => void;
}

export const ReviewModal: React.FC<Props> = ({
  bookingId,
  catererId,
  customerId,
  catererName,
  onClose,
  onSuccess,
}) => {
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const review = await submitReview({
        booking_id: bookingId,
        customer_id: customerId,
        caterer_id: catererId,
        rating,
        comment: comment.trim() || undefined,
      });

      if (!review) {
        // Fallback for mock demo
        const mockRev: Review = {
          id: 'rev_' + Date.now(),
          booking_id: bookingId,
          customer_id: customerId,
          caterer_id: catererId,
          rating,
          comment: comment.trim() || null,
          created_at: new Date().toISOString(),
        };
        onSuccess(mockRev);
        return;
      }

      onSuccess(review);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-bold text-slate-900">Rate Caterer & Leave Review</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          How was your experience with <b>{catererName}</b> in Tirupati?
        </p>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Star Rating */}
          <div className="text-center">
            <span className="text-xs font-semibold uppercase text-slate-500 block mb-2">Overall Rating</span>
            <div className="flex items-center justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(star)}
                  className="p-1 transition transform hover:scale-110"
                >
                  <Star
                    className={`h-7 w-7 ${
                      (hoverRating || rating) >= star
                        ? 'fill-amber-400 text-amber-500'
                        : 'text-slate-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            <span className="text-xs font-bold text-slate-700 mt-1 block">
              {rating === 5
                ? '5 Stars - Outstanding Feast!'
                : rating === 4
                ? '4 Stars - Great Service'
                : rating === 3
                ? '3 Stars - Average Experience'
                : `${rating} Stars`}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">Review Comments (Optional)</label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. Sambar and Gutti Vankaya curry were delicious! Food was served hot and on time."
              className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              <span>{submitting ? 'Submitting...' : 'Submit Review'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
