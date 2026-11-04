import { supabase } from '@/lib/supabase';
import type { Caterer, CatererStatus, PlatformSettings } from '@/types/database';

export async function fetchAllCaterers(): Promise<Caterer[]> {
  const { data, error } = await supabase
    .from('caterers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching all caterers for admin:', error);
    return [];
  }
  return (data || []) as Caterer[];
}

export async function updateCatererStatus(
  catererId: string,
  status: CatererStatus,
  rejectionReason?: string
): Promise<boolean> {
  const payload: Partial<Caterer> = {
    status,
    rejection_reason: rejectionReason || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('caterers')
    .update(payload)
    .eq('id', catererId);

  if (error) {
    console.error('Error updating caterer status:', error);
    return false;
  }
  return true;
}

export async function fetchPlatformSettings(): Promise<PlatformSettings | null> {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (error) {
    console.error('Error fetching platform settings:', error);
    return null;
  }
  return data as PlatformSettings;
}

export async function updateCommissionPct(commissionPct: number): Promise<boolean> {
  const { error } = await supabase
    .from('platform_settings')
    .update({ commission_pct: commissionPct, updated_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) {
    console.error('Error updating commission rate:', error);
    return false;
  }
  return true;
}
