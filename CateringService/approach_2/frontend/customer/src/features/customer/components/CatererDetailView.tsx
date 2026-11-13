import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { Star, MapPin, Check, Sparkles, Users, Plus, AlertCircle, ChefHat } from 'lucide-react';
import { formatPaiseToINR } from '@/lib/formatters';
import { BookingRequestModal } from './BookingRequestModal';
import { AuthRequiredModal } from './AuthRequiredModal';
import { CustomComboBuilderModal } from './CustomComboBuilderModal';
import type { Caterer, Package, PackageItem, Booking, MenuItem } from '@/types/database';

export const CatererDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [caterer, setCaterer] = useState<Caterer>({
    id: id || '22222222-2222-2222-2222-222222222201',
    owner_id: '11111111-1111-1111-1111-111111111101',
    business_name: 'Royal Feast Caterers',
    description:
      'Premier traditional wedding and event feast catering in Tirupati. Specializing in authentic South Indian, Andhra Brahmin feasts, plantain leaf service, and Rayalaseema specialties with high hygiene standards.',
    city: 'Tirupati',
    service_areas: ['Alipiri', 'MR Palli', 'Bhavani Nagar', 'Chandragiri', 'Renigunta'],
    cuisines: ['andhra', 'south_indian', 'traditional_meals'],
    fssai_number: '10123000004567',
    gst_number: '37AAAAA0000A1Z5',
    status: 'approved',
    rejection_reason: null,
    avg_rating: 4.8,
    review_count: 12,
    min_guests: 50,
    max_guests: 1500,
    allows_custom_combo: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const [packages, setPackages] = useState<(Package & { items: PackageItem[] })[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [, setLoading] = useState(true);

  // Party size / number of people for service
  const [serviceGuests, setServiceGuests] = useState<number>(50);

  // A la carte menu filter
  const [activeDishCategory, setActiveDishCategory] = useState<string>('all');
  const [comboPreselectedId, setComboPreselectedId] = useState<string | undefined>(undefined);

  // Modals & Booking selection
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [selectedCustomCombo, setSelectedCustomCombo] = useState<{
    comboName: string;
    selectedItems: MenuItem[];
    pricePerPlatePaise: number;
    guestCount: number;
  } | null>(null);

  const [authRequiredPkg, setAuthRequiredPkg] = useState<Package | null>(null);
  const [showComboBuilder, setShowComboBuilder] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/caterers/${id}`)
      .then((res) => res.json())
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
            fssai_number: data.caterer.fssaiNumber || '10123000004567',
            gst_number: data.caterer.gstNumber,
            status: data.caterer.status,
            rejection_reason: data.caterer.rejectionReason,
            avg_rating: data.caterer.avgRating || 4.8,
            review_count: data.caterer.reviewCount || 0,
            min_guests: data.caterer.minGuests || 50,
            max_guests: data.caterer.maxGuests || 2000,
            allows_custom_combo: data.caterer.allowsCustomCombo ?? true,
            created_at: data.caterer.createdAt,
            updated_at: data.caterer.updatedAt || data.caterer.createdAt,
          };
          setCaterer(loadedCaterer);
          setServiceGuests(Math.max(50, loadedCaterer.min_guests || 25));

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
        }
      })
      .catch((err) => console.error('Failed to load caterer details:', err))
      .finally(() => setLoading(false));
  }, [id]);

  const handleRequestToBook = (pkg: Package) => {
    if (!user) {
      setAuthRequiredPkg(pkg);
    } else {
      setSelectedPackage(pkg);
      setSelectedCustomCombo(null);
    }
  };

  const handleOpenComboBuilderWithDish = (dishId?: string) => {
    setComboPreselectedId(dishId);
    setShowComboBuilder(true);
  };

  const handleBookingCreated = (_booking: Booking) => {
    setSelectedPackage(null);
    setSelectedCustomCombo(null);
    setBookingSuccess(true);
  };

  const isGuestsBelowMin = serviceGuests < (caterer.min_guests || 25);
  const isGuestsAboveMax = Boolean(caterer.max_guests && serviceGuests > caterer.max_guests);

  const filteredDishes = menuItems.filter((dish) => {
    if (activeDishCategory === 'all') return true;
    if (activeDishCategory === 'starters') return dish.category === 'starter';
    if (activeDishCategory === 'mains') return dish.category === 'main';
    if (activeDishCategory === 'bread_rice') return dish.category === 'bread_rice';
    if (activeDishCategory === 'desserts') return dish.category === 'dessert';
    if (activeDishCategory === 'beverages') return dish.category === 'welcome_drink' || dish.category === 'beverage';
    return true;
  });

  return (
    <div className="space-y-6">
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
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{caterer.business_name}</h1>
            <p className="text-sm text-slate-600 max-w-2xl">{caterer.description}</p>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-2">
              <div className="flex items-center gap-1 font-bold text-amber-600">
                <Star className="h-4 w-4 fill-current" />
                <span>{caterer.avg_rating} ({caterer.review_count} reviews)</span>
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
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50/70 via-white to-teal-50/70 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-700" />
              <h2 className="text-sm font-bold text-slate-900">Select Number of People for Service</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Adjust party size to see live estimated feast costs across all packages and custom combinations.
            </p>
          </div>

          {/* Guest Count Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Direct Custom People Input Box */}
            <div className="flex items-center gap-2 bg-white border border-emerald-300 rounded-xl px-3 py-1.5 shadow-2xs">
              <label htmlFor="custom-service-guests" className="text-xs font-bold text-slate-700 whitespace-nowrap">
                Enter Custom Count:
              </label>
              <input
                id="custom-service-guests"
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
            <span className="font-semibold text-slate-800">Caterer Order Limits:</span>
            <span>Min: <b>{caterer.min_guests || 25}</b> guests</span>
            <span>•</span>
            <span>Max: <b>{caterer.max_guests ? `${caterer.max_guests} guests` : 'Flexible (2,000+)'}</b></span>
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

      {/* Custom Feast Combo Builder Banner */}
      {caterer.allows_custom_combo && menuItems.length > 0 && (
        <div className="rounded-2xl border-2 border-dashed border-emerald-400 bg-gradient-to-r from-emerald-50 via-teal-50 to-white p-6 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-0.5 text-xs font-bold text-white">
              <Sparkles className="h-3.5 w-3.5" />
              Build Your Own Menu
            </span>
            <h3 className="text-lg font-bold text-slate-900">Custom Combo Feast Builder</h3>
            <p className="text-xs text-slate-600 max-w-xl">
              Don't want fixed packages? Handpick your favorite starters, main curries, breads, and desserts from {caterer.business_name}'s {menuItems.length} kitchen recipes with instant live per-plate pricing for {serviceGuests} guests!
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleOpenComboBuilderWithDish()}
            className="rounded-xl bg-emerald-700 px-6 py-3 text-xs font-bold text-white shadow-md hover:bg-emerald-800 transition shrink-0"
          >
            Customize Feast Plate
          </button>
        </div>
      )}

      {/* Packages Section with Live Price Multipliers */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Available Catering Packages ({packages.length})</h2>
            <p className="text-xs text-slate-500">Fixed curated menus with live pricing calculated for {serviceGuests} guests</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {packages.map((pkg) => {
            const estimatedPackageTotalPaise = pkg.price_per_plate * serviceGuests;
            return (
              <div
                key={pkg.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          pkg.is_veg ? 'bg-emerald-500' : 'bg-red-500'
                        }`}
                        title={pkg.is_veg ? 'Vegetarian' : 'Non-Vegetarian'}
                      />
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
                    <p className="mt-2 text-xs text-slate-600">{pkg.description}</p>
                  )}

                  <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 border border-slate-100">
                    <div>
                      <span>Estimated Total ({serviceGuests} guests):</span>
                      <span className="font-extrabold text-slate-900 block text-sm">
                        {formatPaiseToINR(estimatedPackageTotalPaise)}
                      </span>
                    </div>
                    <div className="text-right text-[11px] text-emerald-700 font-semibold">
                      <span>25% Advance:</span>
                      <span className="block font-bold">
                        {formatPaiseToINR(Math.round(estimatedPackageTotalPaise * 0.25))}
                      </span>
                    </div>
                  </div>

                  {/* Courses included */}
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <span className="text-xs font-semibold uppercase text-slate-500 block mb-2">
                      Menu Items ({pkg.items.length}):
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {pkg.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-1.5 text-xs text-slate-700">
                          <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                          <span>{item.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Min {pkg.min_guests} guests</span>
                  <button
                    type="button"
                    onClick={() => handleRequestToBook(pkg)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
                  >
                    Request to Book ({serviceGuests} Guests)
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* A La Carte Menu & Kitchen Dishes Catalog */}
      {menuItems.length > 0 && (
        <section className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ChefHat className="h-5 w-5 text-emerald-700" />
                <span>Kitchen Menu & Individual Dishes ({menuItems.length})</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Authentic items freshly prepared in {caterer.business_name}'s kitchen. Pick individual items to build a custom combo feast.
              </p>
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
                  onClick={() => setActiveDishCategory(cat.id)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold shrink-0 transition ${
                    activeDishCategory === cat.id
                      ? 'bg-emerald-700 text-white shadow-2xs font-bold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDishes.map((dish) => (
              <div
                key={dish.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs flex flex-col justify-between hover:border-emerald-300 transition"
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
                    onClick={() => handleOpenComboBuilderWithDish(dish.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 text-xs font-bold text-emerald-800 border border-emerald-200 transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add to Custom Feast</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Custom Combo Builder Modal */}
      {showComboBuilder && (
        <CustomComboBuilderModal
          caterer={caterer}
          menuItems={menuItems}
          initialSelectedItemId={comboPreselectedId}
          initialGuestCount={serviceGuests}
          onClose={() => {
            setShowComboBuilder(false);
            setComboPreselectedId(undefined);
          }}
          onProceedToBooking={(customCombo) => {
            setShowComboBuilder(false);
            setComboPreselectedId(undefined);
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
      {authRequiredPkg && (
        <AuthRequiredModal
          catererName={caterer.business_name}
          packageName={authRequiredPkg.name}
          onClose={() => setAuthRequiredPkg(null)}
        />
      )}
    </div>
  );
};
