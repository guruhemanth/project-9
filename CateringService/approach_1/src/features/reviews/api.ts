import { supabase } from '@/lib/supabase';
import type { Review } from '@/types/database';

export async function submitReview(payload: {
  booking_id: string;
  customer_id: string;
  caterer_id: string;
  rating: number;
  comment?: string;
}): Promise<Review | null> {
  const { data, error } = await supabase
    .from('reviews')
    .insert([
      {
        booking_id: payload.booking_id,
        customer_id: payload.customer_id,
        caterer_id: payload.caterer_id,
        rating: payload.rating,
        comment: payload.comment || null,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Error submitting review:', error);
    return null;
  }
  return data as Review;
}

export async function fetchCatererReviews(catererId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('caterer_id', catererId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching reviews:', error);
    return [];
  }
  return (data || []) as Review[];
}
