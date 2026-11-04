import { supabase } from '@/lib/supabase';
import type { Caterer, Package, PackageItem, Addon, CatererDocument } from '@/types/database';

export async function fetchCatererByOwner(ownerId: string): Promise<Caterer | null> {
  const { data, error } = await supabase
    .from('caterers')
    .select('*')
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching caterer:', error);
    return null;
  }
  return data as Caterer | null;
}

export async function createCatererProfile(catererData: {
  owner_id: string;
  business_name: string;
  description?: string;
  city: string;
  service_areas: string[];
  cuisines: string[];
  fssai_number: string;
  gst_number?: string;
}): Promise<Caterer | null> {
  const { data, error } = await supabase
    .from('caterers')
    .insert([
      {
        ...catererData,
        status: 'pending',
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Error creating caterer profile:', error);
    return null;
  }
  return data as Caterer;
}

export async function fetchCatererPackages(catererId: string): Promise<(Package & { items: PackageItem[] })[]> {
  const { data, error } = await supabase
    .from('packages')
    .select('*, items:package_items(*)')
    .eq('caterer_id', catererId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching packages:', error);
    return [];
  }
  return (data || []) as (Package & { items: PackageItem[] })[];
}

export async function createPackage(
  packageData: {
    caterer_id: string;
    name: string;
    description?: string;
    price_per_plate: number; // in paise
    min_guests: number;
    max_guests?: number | null;
    is_veg: boolean;
  },
  items: { name: string; category: 'starter' | 'main' | 'dessert' | 'beverage' }[]
): Promise<Package | null> {
  const { data: pkg, error: pkgError } = await supabase
    .from('packages')
    .insert([packageData])
    .select()
    .single();

  if (pkgError || !pkg) {
    console.error('Error creating package:', pkgError);
    return null;
  }

  if (items.length > 0) {
    const itemsToInsert = items.map((item) => ({
      package_id: pkg.id,
      name: item.name,
      category: item.category,
    }));
    const { error: itemsError } = await supabase.from('package_items').insert(itemsToInsert);
    if (itemsError) {
      console.error('Error inserting package items:', itemsError);
    }
  }

  return pkg as Package;
}

export async function togglePackageActive(packageId: string, isActive: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('packages')
    .update({ is_active: isActive })
    .eq('id', packageId);

  return !error;
}

export async function fetchCatererAddons(catererId: string): Promise<Addon[]> {
  const { data, error } = await supabase
    .from('addons')
    .select('*')
    .eq('caterer_id', catererId);

  if (error) {
    console.error('Error fetching addons:', error);
    return [];
  }
  return (data || []) as Addon[];
}

export async function createAddon(addonData: {
  caterer_id: string;
  name: string;
  price: number; // in paise
  pricing_unit: 'flat' | 'per_plate';
}): Promise<Addon | null> {
  const { data, error } = await supabase
    .from('addons')
    .insert([addonData])
    .select()
    .single();

  if (error) {
    console.error('Error creating addon:', error);
    return null;
  }
  return data as Addon;
}

export async function fetchCatererDocuments(catererId: string): Promise<CatererDocument[]> {
  const { data, error } = await supabase
    .from('caterer_documents')
    .select('*')
    .eq('caterer_id', catererId);

  if (error) {
    console.error('Error fetching caterer documents:', error);
    return [];
  }
  return (data || []) as CatererDocument[];
}
