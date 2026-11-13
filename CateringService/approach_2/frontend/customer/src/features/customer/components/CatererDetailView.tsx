import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  Star,
  MapPin,
  Check,
  Sparkles,
  Users,
  Plus,
  AlertCircle,
  ChefHat,
  Search,
  Layers,
  ArrowRight,
  Trash2,
  UtensilsCrossed,
  Info,
} from 'lucide-react';
import { formatPaiseToINR } from '@/lib/formatters';
import { BookingRequestModal } from './BookingRequestModal';
import { AuthRequiredModal } from './AuthRequiredModal';
import { CustomComboBuilderModal } from './CustomComboBuilderModal';
import { PaymentModal } from '@/features/payment/components/PaymentModal';
import type { Caterer, Package, PackageItem, Booking, MenuItem, MenuItemCategory } from '@/types/database';

const CATEGORY_NAMES: Record<MenuItemCategory, string> = {
  welcome_drink: 'Welcome Drinks',
  starter: 'Starters',
  main: 'Curries & Dal',
  bread_rice: 'Breads & Rice',
  dessert: 'Sweets & Desserts',
  beverage: 'Beverages',
  accompaniment: 'Accompaniments',
};

// Helper to intelligently map a package's items to the caterer's menu_items
function getDishIdsForPackage(pkg: Package & { items: PackageItem[] }, menuItems: MenuItem[]): string[] {
  const matchedIds: string[] = [];
  const menuItemsLower = menuItems.map((m) => ({ item: m, nameLower: m.name.toLowerCase() }));

  for (const pkgItem of pkg.items) {
    const pkgLower = pkgItem.name.toLowerCase();
    // 1. Exact or substring match
    const exact = menuItemsLower.find(
      (m) => m.nameLower === pkgLower || m.nameLower.includes(pkgLower) || pkgLower.includes(m.nameLower)
    );
    if (exact && !matchedIds.includes(exact.item.id)) {
      matchedIds.push(exact.item.id);
      continue;
    }
    // 2. Keyword match
    const words = pkgLower.split(/[\s,&]+/).filter((w) => w.length > 3);
    const keywordMatch = menuItemsLower.find(
      (m) => !matchedIds.includes(m.item.id) && words.some((w) => m.nameLower.includes(w))
    );
    if (keywordMatch) {
      matchedIds.push(keywordMatch.item.id);
      continue;
    }
    // 3. Fallback to same category
    const catMatch = menuItems.find(
      (m) =>
        !matchedIds.includes(m.id) &&
        (m.category === pkgItem.category || (pkgItem.category === 'main' && m.category === 'bread_rice'))
    );
    if (catMatch) {
      matchedIds.push(catMatch.id);
    }
  }

  // If matched less than 2 and menuItems available, pick first 4 menuItems as baseline
  if (matchedIds.length === 0 && menuItems.length > 0) {
    return menuItems.slice(0, 4).map((m) => m.id);
  }
  return matchedIds;
}

export const CatererDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [caterer, setCaterer] = useState<Caterer | null>(null);
  const [packages, setPackages] = useState<(Package & { items: PackageItem[] })[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Party size / number of people for service
  const [serviceGuests, setServiceGuests] = useState<number>(50);

  // Navigation mode: 'combos' (Hardset Curated Packages) | 'custom' (Build Custom Feast) | 'dishes' (All Kitchen Items)
  const [menuViewMode, setMenuViewMode] = useState<'combos' | 'custom' | 'dishes'>('combos');

  // Custom Feast State
  const [customComboTitle, setCustomComboTitle] = useState<string>('My Custom Feast Combo');
  const [selectedCustomDishIds, setSelectedCustomDishIds] = useState<Set<string>>(new Set());
  const [comboCustomizeNotice, setComboCustomizeNotice] = useState<string | null>(null);

  // Search & Filter state for catalog / builder
  const [dishSearchQuery, setDishSearchQuery] = useState<string>('');
  const [dietaryFilter, setDietaryFilter] = useState<'all' | 'veg' | 'non_veg'>('all');
  const [activeCatalogCategory, setActiveCatalogCategory] = useState<string>('all');

  // Modals & Booking selection
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [selectedCustomCombo, setSelectedCustomCombo] = useState<{
    comboName: string;
    selectedItems: MenuItem[];
    pricePerPlatePaise: number;
    guestCount: number;
  } | null>(null);

  const [authRequiredTarget, setAuthRequiredTarget] = useState<string | null>(null);
  const [showComboBuilderModal, setShowComboBuilderModal] = useState(false);
  const [modalInitialDishId, setModalInitialDishId] = useState<string | undefined>(undefined);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [paymentBooking, setPaymentBooking] = useState<any | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('No caterer ID specified');
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/caterers/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Caterer not found');
        return res.json();
      })
      .then((data) => {
        if (data.caterer) {
          const loadedCaterer: Caterer = {
            id: data.caterer.id,
            owner_id: data.caterer.ownerId,
            business_name: data.caterer.businessName,
            description: data.caterer.description,
            city: data.caterer.city,
            state: data.caterer.state,
            pincode: data.caterer.pincode,
            address: data.caterer.address,
            service_areas: data.caterer.serviceAreas || [],
            cuisines: data.caterer.cuisines || [],
            fssai_number: data.caterer.fssaiNumber || 'Pending Verification',
            gst_number: data.caterer.gstNumber,
            status: data.caterer.status,
            rejection_reason: data.caterer.rejectionReason,
            avg_rating: Number(data.caterer.avgRating ?? data.caterer.avg_rating ?? 0),
            review_count: Number(data.caterer.reviewCount ?? data.caterer.review_count ?? 0),
            min_guests: data.caterer.minGuests || 25,
            max_guests: data.caterer.maxGuests || 2000,
            allows_custom_combo: data.caterer.allowsCustomCombo ?? true,
            created_at: data.caterer.createdAt,
            updated_at: data.caterer.updatedAt || data.caterer.createdAt,
          };
          setCaterer(loadedCaterer);
          setServiceGuests(Math.max(25, loadedCaterer.min_guests || 25));

          if (data.caterer.packages) {
            setPackages(
              data.caterer.packages.map((p: any) => ({
                id: p.id,
                caterer_id: data.caterer.id,
                name: p.name,
                description: p.description,
                price_per_plate: p.pricePerPlatePaise,
                min_guests: p.minGuests,
                max_guests: p.maxGuests,
                is_veg: true,
                is_active: true,
                created_at: new Date().toISOString(),
                items: p.items || [],
              }))
            );
          }

          if (data.caterer.menuItems) {
            setMenuItems(
              data.caterer.menuItems.map((m: any) => ({
                id: m.id,
                caterer_id: data.caterer.id,
                name: m.name,
                category: m.category,
                price_paise: m.pricePaise,
                is_veg: m.isVeg,
                description: m.description,
                is_available: m.isAvailable,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }))
            );
          }
        } else {
          throw new Error('Caterer profile not found');
        }
      })
      .catch((err) => {
        console.error('Failed to load caterer details:', err);
        setError('Unable to load caterer profile.');
        setCaterer(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Toggle dish in the custom feast selection
  const toggleCustomDish = (dishId: string) => {
    setSelectedCustomDishIds((prev) => {
      const next = new Set(prev);
      if (next.has(dishId)) {
        next.delete(dishId);
      } else {
        next.add(dishId);
      }
      return next;
    });
  };

  const removeCustomDish = (dishId: string) => {
    setSelectedCustomDishIds((prev) => {
      const next = new Set(prev);
      next.delete(dishId);
      return next;
    });
  };

  const clearAllCustomDishes = () => {
    setSelectedCustomDishIds(new Set());
    setComboCustomizeNotice(null);
  };

  // Pre-load dishes from a curated hardset combo to customize
  const handleCustomizePackage = (pkg: Package & { items: PackageItem[] }) => {
    const dishIds = getDishIdsForPackage(pkg, menuItems);
    setSelectedCustomDishIds(new Set(dishIds));
    setCustomComboTitle(`Customized ${pkg.name}`);
    setComboCustomizeNotice(`Loaded ${dishIds.length} dishes from "${pkg.name}". Customize your items below!`);
    setMenuViewMode('custom');
    window.scrollTo({ top: 380, behavior: 'smooth' });
  };

  // Direct Book Handlers
  const handleRequestToBookPackage = (pkg: Package) => {
    if (!user) {
      setAuthRequiredTarget(pkg.name);
    } else {
      setSelectedPackage(pkg);
      setSelectedCustomCombo(null);
    }
  };

  const handleProceedToBookCustomCombo = () => {
    const selectedDishes = menuItems.filter((m) => selectedCustomDishIds.has(m.id));
    if (selectedDishes.length === 0) return;

    const perPlatePaise = selectedDishes.reduce((sum, item) => sum + item.price_paise, 0);

    if (!user) {
      setAuthRequiredTarget(customComboTitle || 'Custom Feast Package');
      return;
    }

    setSelectedCustomCombo({
      comboName: customComboTitle.trim() || 'Custom Feast Package',
      selectedItems: selectedDishes,
      pricePerPlatePaise: perPlatePaise,
      guestCount: serviceGuests,
    });
    setSelectedPackage(null);
  };

  const handleBookingCreated = (createdBooking: Booking) => {
    const customComboSnapshot = selectedCustomCombo;
    const packageSnapshot = selectedPackage;
    setSelectedPackage(null);
    setSelectedCustomCombo(null);
    setSelectedCustomDishIds(new Set());
    setPaymentBooking({
      ...createdBooking,
      caterer_name: caterer?.business_name,
      package_name: packageSnapshot?.name,
      custom_combo_name: customComboSnapshot?.comboName,
      customized_items: customComboSnapshot?.selectedItems,
      guest_count: createdBooking.guest_count || serviceGuests,
      event_date: createdBooking.event_date,
      total_amount_paise:
        (createdBooking as any).total_amount_paise ||
        createdBooking.total_amount ||
        (packageSnapshot ? packageSnapshot.price_per_plate * serviceGuests : customTotalCostPaise),
    });
  };

  // Calculations for custom combo
  const selectedDishes = menuItems.filter((m) => selectedCustomDishIds.has(m.id));
  const customPerPlatePaise = selectedDishes.reduce((acc, m) => acc + m.price_paise, 0);
  const customTotalCostPaise = customPerPlatePaise * serviceGuests;
  const customAdvancePaise = Math.round(customTotalCostPaise * 0.25);

  const isGuestsBelowMin = caterer ? serviceGuests < (caterer.min_guests || 25) : false;
  const isGuestsAboveMax = caterer ? Boolean(caterer.max_guests && serviceGuests > caterer.max_guests) : false;

  // Filtered dishes for the catalog/dishes view
  const filteredCatalogDishes = menuItems.filter((dish) => {
    if (activeCatalogCategory !== 'all') {
      if (activeCatalogCategory === 'starters' && dish.category !== 'starter') return false;
      if (activeCatalogCategory === 'mains' && dish.category !== 'main') return false;
      if (activeCatalogCategory === 'bread_rice' && dish.category !== 'bread_rice') return false;
      if (activeCatalogCategory === 'desserts' && dish.category !== 'dessert') return false;
      if (
        activeCatalogCategory === 'beverages' &&
        dish.category !== 'welcome_drink' &&
        dish.category !== 'beverage'
      ) {
        return false;
      }
    }
    if (dietaryFilter === 'veg' && !dish.is_veg) return false;
    if (dietaryFilter === 'non_veg' && dish.is_veg) return false;
    if (dishSearchQuery.trim()) {
      const q = dishSearchQuery.toLowerCase();
      const matchName = dish.name.toLowerCase().includes(q);
      const matchDesc = dish.description?.toLowerCase().includes(q) || false;
      if (!matchName && !matchDesc) return false;
    }
    return true;
  });

  // Group dishes by category for the inline Custom Builder
  const groupedCategories: MenuItemCategory[] = [
    'welcome_drink',
    'starter',
    'main',
    'bread_rice',
    'dessert',
    'beverage',
  ];

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse pb-24">
        <div>
          <Link to="/" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition">
            &larr; Back to all caterers
          </Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="h-4 w-32 bg-slate-200 rounded" />
          <div className="h-8 w-72 bg-slate-200 rounded" />
          <div className="h-4 w-full max-w-xl bg-slate-200 rounded" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 h-48" />
      </div>
    );
  }

  if (error || !caterer) {
    return (
      <div className="space-y-6 pb-24">
        <div>
          <Link to="/" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition">
            &larr; Back to all caterers
          </Link>
        </div>
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center space-y-3 shadow-xs">
          <UtensilsCrossed className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="text-lg font-bold text-slate-900">Catering Service Not Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            The caterer profile you are looking for does not exist or has not yet been approved for public bookings.
          </p>
          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 transition"
            >
              Browse All Catering Services &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Back button */}
      <div>
        <Link to="/" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition">
          &larr; Back to all caterers
        </Link>
      </div>

      {bookingSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 flex items-center justify-between shadow-2xs">
          <div>
            <h4 className="text-sm font-bold">Booking Request Sent Successfully!</h4>
            <p className="text-xs text-emerald-800 mt-0.5">
              Your request for {serviceGuests} guests has reached {caterer.business_name}. You will be notified once accepted.
            </p>
          </div>
          <Link
            to="/customer/bookings"
            className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
          >
            View Order History
          </Link>
        </div>
      )}

      {/* Caterer Header Profile */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                Verified FSSAI: {caterer.fssai_number}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700">
                {caterer.city}, {caterer.state || 'India'}
              </span>
              <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold">
                ✨ Custom Combos Available
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{caterer.business_name}</h1>
            <p className="text-sm text-slate-600 max-w-2xl">{caterer.description}</p>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-2">
              <div className="flex items-center gap-1 font-bold text-amber-600">
                <Star className="h-4 w-4 fill-current" />
                <span>
                  {caterer.review_count > 0
                    ? `${Number(caterer.avg_rating).toFixed(1)} (${caterer.review_count} ${caterer.review_count === 1 ? 'review' : 'reviews'})`
                    : 'New Caterer (No reviews yet)'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="h-4 w-4 text-slate-400" />
                <span>Coverage: {caterer.service_areas.join(', ')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Number of Guests for Service Selector */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50/80 via-white to-teal-50/80 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-700" />
              <h2 className="text-sm font-bold text-slate-900">Select Number of People for Service</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Live estimated costs adjust instantly across both hardset combos and custom item menus.
            </p>
          </div>

          {/* Guest Count Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Direct Custom People Input Box */}
            <div className="flex items-center gap-2 bg-white border border-emerald-300 rounded-xl px-3 py-1.5 shadow-2xs">
              <label htmlFor="service-guests-input" className="text-xs font-bold text-slate-700 whitespace-nowrap">
                Enter Custom Count:
              </label>
              <input
                id="service-guests-input"
                type="number"
                min="1"
                max="50000"
                value={serviceGuests || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setServiceGuests(isNaN(val) ? 0 : Math.max(1, val));
                }}
                placeholder="e.g. 175"
                className="w-20 text-center font-extrabold text-sm text-emerald-950 bg-emerald-50/70 border border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-lg py-1 px-1.5"
                title="Enter custom party size / number of people"
              />
              <span className="text-xs text-slate-500 font-semibold">people</span>
            </div>

            {/* Stepper with directly editable center input */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setServiceGuests((g) => Math.max(1, g - 25))}
                className="h-8 w-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center transition"
                title="Decrease 25 guests"
              >
                -
              </button>
              <div className="px-2 text-center flex flex-col items-center">
                <input
                  type="number"
                  min="1"
                  max="50000"
                  value={serviceGuests || ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setServiceGuests(isNaN(val) ? 0 : Math.max(1, val));
                  }}
                  className="w-16 text-center text-base font-extrabold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded bg-transparent"
                  title="Directly edit number of guests"
                />
                <span className="text-[9px] text-slate-400 block font-semibold uppercase leading-none">Guests</span>
              </div>
              <button
                type="button"
                onClick={() => setServiceGuests((g) => g + 25)}
                className="h-8 w-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center transition"
                title="Increase 25 guests"
              >
                +
              </button>
            </div>

            {/* Quick Presets */}
            <div className="hidden lg:flex items-center gap-1.5">
              {[50, 100, 250, 500, 1000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setServiceGuests(preset)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    serviceGuests === preset
                      ? 'bg-emerald-700 text-white shadow-2xs font-bold'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Capacity Guideline Notice */}
        <div className="mt-3 pt-3 border-t border-emerald-100/80 flex flex-wrap items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <span className="font-semibold text-slate-800">Caterer Capacity Range:</span>
            <span>
              Min: <b>{caterer.min_guests || 25}</b> guests
            </span>
            <span>•</span>
            <span>
              Max: <b>{caterer.max_guests ? `${caterer.max_guests} guests` : 'Flexible (2,000+)'}</b>
            </span>
          </div>

          {isGuestsBelowMin && (
            <div className="flex items-center gap-1 text-amber-700 font-semibold text-xs mt-1 md:mt-0">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Below caterer minimum ({caterer.min_guests} guests). Baseline charge may apply.</span>
            </div>
          )}
          {isGuestsAboveMax && (
            <div className="flex items-center gap-1 text-red-600 font-semibold text-xs mt-1 md:mt-0">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Exceeds caterer stated maximum capacity ({caterer.max_guests} guests).</span>
            </div>
          )}
        </div>
      </div>

      {/* Interactive 3-Tab Menu View Switcher */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Tab 1: Hardset Curated Combos */}
          <button
            type="button"
            onClick={() => setMenuViewMode('combos')}
            className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs font-bold transition ${
              menuViewMode === 'combos'
                ? 'bg-emerald-800 text-white shadow-md'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-100'
            }`}
          >
            <Layers className="h-4 w-4" />
            <div className="text-left">
              <span className="block leading-tight">Hardset Curated Combos</span>
              <span className={`text-[10px] font-normal ${menuViewMode === 'combos' ? 'text-emerald-200' : 'text-slate-400'}`}>
                {packages.length} fixed packages
              </span>
            </div>
          </button>

          {/* Tab 2: Custom Menu & Combo Builder */}
          <button
            type="button"
            onClick={() => setMenuViewMode('custom')}
            className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs font-bold transition relative ${
              menuViewMode === 'custom'
                ? 'bg-emerald-800 text-white shadow-md'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-100'
            }`}
          >
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <div className="text-left">
              <span className="block leading-tight">Build Custom Feast</span>
              <span className={`text-[10px] font-normal ${menuViewMode === 'custom' ? 'text-emerald-200' : 'text-slate-400'}`}>
                {selectedCustomDishIds.size > 0 ? `${selectedCustomDishIds.size} dishes picked` : 'Item-by-item selection'}
              </span>
            </div>
            {selectedCustomDishIds.size > 0 && (
              <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white animate-pulse" />
            )}
          </button>

          {/* Tab 3: All Kitchen Dishes Catalog */}
          <button
            type="button"
            onClick={() => setMenuViewMode('dishes')}
            className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs font-bold transition ${
              menuViewMode === 'dishes'
                ? 'bg-emerald-800 text-white shadow-md'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-100'
            }`}
          >
            <ChefHat className="h-4 w-4" />
            <div className="text-left">
              <span className="block leading-tight">Kitchen Dishes Catalog</span>
              <span className={`text-[10px] font-normal ${menuViewMode === 'dishes' ? 'text-emerald-200' : 'text-slate-400'}`}>
                {menuItems.length} individual items
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: HARDSET CURATED COMBOS                                            */}
      {/* ========================================================================= */}
      {menuViewMode === 'combos' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Layers className="h-5 w-5 text-emerald-700" />
                <span>Hardset Curated Combos ({packages.length})</span>
              </h2>
              <p className="text-xs text-slate-500">
                Fixed course packages curated by chef. Book as-is, or click <b>"Customize This Combo"</b> to substitute dishes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMenuViewMode('custom')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-800 transition self-start sm:self-auto"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Or Create Fresh Custom Combo &rarr;</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {packages.map((pkg) => {
              const estimatedPackageTotalPaise = pkg.price_per_plate * serviceGuests;
              return (
                <div
                  key={pkg.id}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs flex flex-col justify-between hover:shadow-md transition relative group"
                >
                  <div>
                    {pkg.image_url && (
                      <div className="h-44 w-full bg-slate-100 overflow-hidden relative">
                        <img
                          src={pkg.image_url}
                          alt={pkg.name}
                          className="h-full w-full object-cover group-hover:scale-105 transition duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                        <div className="absolute bottom-2.5 left-3 text-white">
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-black/60 backdrop-blur-xs px-2.5 py-0.5 rounded-full border border-white/20">
                            🍱 {pkg.items.length} Course Feast
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 uppercase tracking-wider">
                              🍱 Fixed Set Combo
                            </span>
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${pkg.is_veg ? 'bg-emerald-500' : 'bg-red-500'}`}
                              title={pkg.is_veg ? 'Vegetarian' : 'Non-Vegetarian'}
                            />
                          </div>
                          <h3 className="text-base font-bold text-slate-900">{pkg.name}</h3>
                        </div>
                        <div className="text-right">
                          <span className="text-base font-extrabold text-slate-900">
                            {formatPaiseToINR(pkg.price_per_plate)}
                          </span>
                          <span className="text-[10px] text-slate-500 block">per plate</span>
                        </div>
                      </div>

                      {pkg.description && (
                        <p className="mt-2 text-xs text-slate-600 leading-relaxed">{pkg.description}</p>
                      )}

                      {/* Live estimated cost for serviceGuests */}
                      <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50/60 px-3.5 py-2.5 text-xs text-slate-600 border border-emerald-100">
                        <div>
                          <span>Estimated Total ({serviceGuests} guests):</span>
                          <span className="font-extrabold text-slate-900 block text-sm">
                            {formatPaiseToINR(estimatedPackageTotalPaise)}
                          </span>
                        </div>
                        <div className="text-right text-[11px] text-emerald-700 font-semibold">
                          <span>25% Advance to Lock:</span>
                          <span className="block font-bold">
                            {formatPaiseToINR(Math.round(estimatedPackageTotalPaise * 0.25))}
                          </span>
                        </div>
                      </div>

                      {/* Included Course Items with Thumbnails */}
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <span className="text-xs font-semibold uppercase text-slate-500 block mb-2">
                          Included Course Dishes ({pkg.items.length}):
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          {pkg.items.map((item) => {
                            const matchedDish = menuItems.find(
                              (m) => m.name.toLowerCase() === item.name.toLowerCase()
                            );
                            const dishThumb = item.image_url || matchedDish?.image_url;
                            return (
                              <div
                                key={item.id}
                                className="flex items-center gap-2 text-xs text-slate-700 bg-slate-50/80 p-1.5 rounded-lg border border-slate-100/80"
                              >
                                {dishThumb ? (
                                  <img
                                    src={dishThumb}
                                    alt={item.name}
                                    className="h-6 w-6 rounded-md object-cover shrink-0 border border-slate-200"
                                  />
                                ) : (
                                  <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                                )}
                                <span className="truncate font-medium">{item.name}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dual Action Buttons: Direct Book vs Customize */}
                  <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleCustomizePackage(pkg)}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-400 bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50 transition shadow-2xs"
                      title="Load this package's dishes into the customizer to add, swap, or remove dishes"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Customize This Combo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRequestToBookPackage(pkg)}
                      className="w-full sm:w-auto rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                    >
                      Book Hardset Combo ({serviceGuests} Guests)
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: CUSTOM MENU & COMBO BUILDER (INLINE & HIGHLY CUSTOMIZABLE)        */}
      {/* ========================================================================= */}
      {menuViewMode === 'custom' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="rounded-2xl border border-emerald-300 bg-gradient-to-r from-emerald-50 via-teal-50 to-white p-5 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-700 px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                    Interactive Customizer
                  </span>
                  <span className="text-xs font-semibold text-emerald-800">
                    Handpick items from {caterer.business_name}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-900">Custom Feast Menu & Combo Builder</h2>
                <p className="text-xs text-slate-600 max-w-xl">
                  Select dishes across each course to create your personalized feast package. Prices sum dynamically in real time.
                </p>
              </div>

              {/* Modal Popout Alternative */}
              <button
                type="button"
                onClick={() => setShowComboBuilderModal(true)}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-white border border-emerald-300 px-4 py-2 text-xs font-bold text-emerald-900 shadow-2xs hover:bg-emerald-50 transition"
              >
                <span>Open Fullscreen Builder Modal</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Custom Notice if loaded from package */}
            {comboCustomizeNotice && (
              <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-100/90 border border-emerald-300 px-3.5 py-2 text-xs text-emerald-900 font-semibold animate-in fade-in">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-emerald-700 shrink-0" />
                  <span>{comboCustomizeNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setComboCustomizeNotice(null)}
                  className="text-emerald-700 hover:text-emerald-900 text-[11px] underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Quick Baseline Package Preset Loaders */}
            {packages.length > 0 && (
              <div className="mt-4 pt-3 border-t border-emerald-200/70 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-emerald-950 flex items-center gap-1">
                  <UtensilsCrossed className="h-3.5 w-3.5 text-emerald-700" />
                  Load Curated Preset as Base:
                </span>
                {packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => handleCustomizePackage(pkg)}
                    className="rounded-lg bg-white border border-emerald-300 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 transition shadow-2xs"
                  >
                    🍱 {pkg.name} ({formatPaiseToINR(pkg.price_per_plate)}/p)
                  </button>
                ))}
                {selectedCustomDishIds.size > 0 && (
                  <button
                    type="button"
                    onClick={clearAllCustomDishes}
                    className="ml-auto text-[11px] font-bold text-red-600 hover:text-red-700 underline"
                  >
                    Clear All Selected Dishes
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Builder Layout Split */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left 2 Cols: Categorized Dish Selection */}
            <div className="lg:col-span-2 space-y-6">
              {/* Event / Combo Name Input */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2">
                <label htmlFor="custom-feast-title" className="block text-xs font-bold text-slate-800">
                  Custom Feast Package Title
                </label>
                <input
                  id="custom-feast-title"
                  type="text"
                  value={customComboTitle}
                  onChange={(e) => setCustomComboTitle(e.target.value)}
                  placeholder="e.g. Wedding Reception Grand Bhojanam"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Categorized Courses Selection */}
              {groupedCategories.map((cat) => {
                const catDishes = menuItems.filter((m) => m.category === cat);
                if (catDishes.length === 0) return null;

                const selectedInCat = catDishes.filter((m) => selectedCustomDishIds.has(m.id));

                return (
                  <div key={cat} className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-600" />
                        <h3 className="text-sm font-bold text-slate-900">{CATEGORY_NAMES[cat] || cat}</h3>
                        <span className="text-xs text-slate-400">({catDishes.length} options)</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        {selectedInCat.length} selected
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {catDishes.map((dish) => {
                        const isSelected = selectedCustomDishIds.has(dish.id);
                        return (
                          <div
                            key={dish.id}
                            onClick={() => toggleCustomDish(dish.id)}
                            className={`rounded-xl border p-2.5 sm:p-3 cursor-pointer transition flex items-center justify-between gap-3 ${
                              isSelected
                                ? 'border-emerald-600 bg-emerald-50/70 shadow-xs ring-1 ring-emerald-500/30'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {/* Dish Image Thumbnail */}
                              <div className="relative h-14 w-14 sm:h-16 sm:w-16 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200/80">
                                {dish.image_url ? (
                                  <img
                                    src={dish.image_url}
                                    alt={dish.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-slate-300">
                                    <UtensilsCrossed className="h-5 w-5" />
                                  </div>
                                )}
                                <span
                                  className={`absolute bottom-1 right-1 h-2 w-2 rounded-full border border-white ${
                                    dish.is_veg ? 'bg-emerald-600' : 'bg-red-600'
                                  }`}
                                  title={dish.is_veg ? 'Vegetarian' : 'Non-Vegetarian'}
                                />
                              </div>

                              <div className="min-w-0 flex-1">
                                <h4 className="font-bold text-xs text-slate-900 truncate">{dish.name}</h4>
                                {dish.description && (
                                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1 leading-snug">
                                    {dish.description}
                                  </p>
                                )}
                                <span className="font-extrabold text-xs text-emerald-800 mt-1 inline-block">
                                  +{formatPaiseToINR(dish.price_paise)}
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0 pl-1">
                              <div
                                className={`h-5 w-5 rounded-md flex items-center justify-center border transition ${
                                  isSelected
                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                    : 'border-slate-300 text-transparent'
                                }`}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Col: Live Feast Plate Summary & Checkout */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 sticky top-20">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                  <span>Custom Feast Summary</span>
                </h3>
                <span className="rounded-full bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 font-bold">
                  {selectedDishes.length} dishes
                </span>
              </div>

              {/* Selected Dishes Ledger */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-700 block">Selected Dishes & Course Rates:</span>
                {selectedDishes.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                    <ChefHat className="h-8 w-8 mx-auto text-slate-300 mb-1" />
                    <span>No dishes selected yet. Pick items from the course categories to assemble your feast plate.</span>
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 text-xs">
                    {selectedDishes.map((dish) => (
                      <div key={dish.id} className="py-1.5 flex items-center justify-between gap-1 group">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                              dish.is_veg ? 'bg-emerald-500' : 'bg-red-500'
                            }`}
                          />
                          <span className="truncate text-slate-700">{dish.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-semibold text-slate-800">{formatPaiseToINR(dish.price_paise)}</span>
                          <button
                            type="button"
                            onClick={() => removeCustomDish(dish.id)}
                            className="text-slate-300 hover:text-red-500 p-0.5 transition"
                            title="Remove dish"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Financial Breakdown */}
              <div className="rounded-xl bg-slate-50 p-3.5 space-y-2 text-xs border border-slate-200/70">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Per-Plate Menu Cost:</span>
                  <span className="font-extrabold text-slate-900">{formatPaiseToINR(customPerPlatePaise)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Guest Multiplier:</span>
                  <span>× {serviceGuests} people</span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-bold text-sm text-slate-900">
                  <span>Gross Event Total:</span>
                  <span className="text-emerald-800">{formatPaiseToINR(customTotalCostPaise)}</span>
                </div>
                <div className="pt-2 border-t border-dashed border-slate-200 flex items-center justify-between text-[11px] text-emerald-700 font-semibold">
                  <span>25% Advance Booking:</span>
                  <span>{formatPaiseToINR(customAdvancePaise)}</span>
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleProceedToBookCustomCombo}
                disabled={selectedDishes.length === 0}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3 text-xs font-bold text-white shadow-md hover:bg-emerald-800 transition disabled:opacity-50"
              >
                <span>Proceed to Book Custom Feast</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: COMPLETE KITCHEN DISHES & PRICING CATALOG                         */}
      {/* ========================================================================= */}
      {menuViewMode === 'dishes' && (
        <section className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ChefHat className="h-5 w-5 text-emerald-700" />
                <span>Kitchen Catalog & Individual Dishes ({menuItems.length})</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Authentic items freshly prepared in {caterer.business_name}'s kitchen. Add dishes directly to your custom feast.
              </p>
            </div>

            {/* Search Input & Dietary Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search kitchen dishes..."
                  value={dishSearchQuery}
                  onChange={(e) => setDishSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-emerald-500 focus:outline-none w-48 sm:w-56"
                />
              </div>

              {/* Dietary Filter */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setDietaryFilter('all')}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                    dietaryFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setDietaryFilter('veg')}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                    dietaryFilter === 'veg' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Veg
                </button>
                <button
                  type="button"
                  onClick={() => setDietaryFilter('non_veg')}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                    dietaryFilter === 'non_veg' ? 'bg-red-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Non-Veg
                </button>
              </div>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'all', label: 'All Dishes' },
              { id: 'starters', label: 'Starters' },
              { id: 'mains', label: 'Curries & Dal' },
              { id: 'bread_rice', label: 'Breads & Rice' },
              { id: 'desserts', label: 'Sweets & Desserts' },
              { id: 'beverages', label: 'Beverages' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCatalogCategory(cat.id)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold shrink-0 transition ${
                  activeCatalogCategory === cat.id
                    ? 'bg-emerald-700 text-white shadow-2xs font-bold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Dishes Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCatalogDishes.map((dish) => {
              const isSelected = selectedCustomDishIds.has(dish.id);
              return (
                <div
                  key={dish.id}
                  className={`rounded-xl border p-4 shadow-2xs flex flex-col justify-between transition ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500/30'
                      : 'border-slate-200 bg-white hover:border-emerald-300'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                            dish.is_veg ? 'bg-emerald-500' : 'bg-red-500'
                          }`}
                          title={dish.is_veg ? 'Pure Vegetarian' : 'Non-Vegetarian'}
                        />
                        <h4 className="text-sm font-bold text-slate-900 leading-snug">{dish.name}</h4>
                      </div>
                      <span className="text-xs font-bold text-slate-900 shrink-0">
                        {formatPaiseToINR(dish.price_paise)}
                      </span>
                    </div>

                    {dish.description && (
                      <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">{dish.description}</p>
                    )}

                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="capitalize font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {dish.category.replace('_', ' ')}
                      </span>
                      <span className="text-emerald-700 font-semibold">Fresh Daily</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Per guest serving</span>
                    <button
                      type="button"
                      onClick={() => toggleCustomDish(dish.id)}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition border ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Added to Feast</span>
                        </>
                      ) : (
                        <>
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add to Custom Feast</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* FLOATING STICKY FEAST TRAY (VISIBLE WHEN DISHES ARE SELECTED)             */}
      {/* ========================================================================= */}
      {selectedCustomDishIds.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-5xl mx-auto rounded-2xl bg-slate-900/95 backdrop-blur-md text-white p-4 shadow-2xl border border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-600/90 flex items-center justify-center text-white font-bold shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">
                  {selectedCustomDishIds.size} Dishes in Custom Feast
                </span>
                <span className="text-emerald-300 font-bold text-xs">
                  • {formatPaiseToINR(customPerPlatePaise)} / plate
                </span>
              </div>
              <span className="text-xs text-slate-300 block">
                Total for {serviceGuests} guests:{' '}
                <b className="text-emerald-400 font-bold text-sm">{formatPaiseToINR(customTotalCostPaise)}</b> (25%
                Advance: {formatPaiseToINR(customAdvancePaise)})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {menuViewMode !== 'custom' && (
              <button
                type="button"
                onClick={() => {
                  setMenuViewMode('custom');
                  window.scrollTo({ top: 380, behavior: 'smooth' });
                }}
                className="rounded-xl bg-slate-800 hover:bg-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-200 transition"
              >
                View Menu
              </button>
            )}
            <button
              type="button"
              onClick={clearAllCustomDishes}
              className="rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-400 hover:text-red-400 transition"
              title="Clear all dishes"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleProceedToBookCustomCombo}
              className="rounded-xl bg-emerald-500 hover:bg-emerald-600 px-4 py-2 text-xs font-bold text-slate-950 transition shadow-md flex items-center gap-1.5"
            >
              <span>Book Custom Feast</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Custom Combo Builder Modal (Fullscreen alternative) */}
      {showComboBuilderModal && (
        <CustomComboBuilderModal
          caterer={caterer}
          menuItems={menuItems}
          packages={packages}
          initialSelectedDishIds={Array.from(selectedCustomDishIds)}
          initialSelectedItemId={modalInitialDishId}
          initialComboName={customComboTitle}
          initialGuestCount={serviceGuests}
          onClose={() => {
            setShowComboBuilderModal(false);
            setModalInitialDishId(undefined);
          }}
          onProceedToBooking={(customCombo) => {
            setShowComboBuilderModal(false);
            setSelectedCustomCombo(customCombo);
            setSelectedPackage(null);
          }}
        />
      )}

      {/* Booking Modal for Packages or Custom Combo */}
      {(selectedPackage || selectedCustomCombo) && user && (
        <BookingRequestModal
          caterer={caterer}
          packageItem={selectedPackage}
          customCombo={selectedCustomCombo}
          initialGuestCount={serviceGuests}
          customerId={user.id}
          onClose={() => {
            setSelectedPackage(null);
            setSelectedCustomCombo(null);
          }}
          onSuccess={handleBookingCreated}
        />
      )}

      {/* Authentication Required Gate Modal */}
      {authRequiredTarget && (
        <AuthRequiredModal
          catererName={caterer.business_name}
          packageName={authRequiredTarget}
          onClose={() => setAuthRequiredTarget(null)}
        />
      )}

      {/* Instant Razorpay Payment Modal right upon booking creation */}
      {paymentBooking && caterer && (
        <PaymentModal
          booking={paymentBooking}
          onClose={() => {
            setPaymentBooking(null);
            setBookingSuccess(true);
          }}
          onPaymentSuccess={(_updated) => {
            setPaymentBooking(null);
            setBookingSuccess(true);
          }}
        />
      )}
    </div>
  );
};
