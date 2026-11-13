import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, MapPin, Star, Utensils, Globe, ChevronDown, Check, Users } from 'lucide-react';
import { formatPaiseToINR } from '@/lib/formatters';
import { fetchCaterers } from './api';
import { POPULAR_CATERING_HUBS } from '@caterconnect/shared';
import type { Caterer } from '@/types/database';

export const CustomerHome: React.FC = () => {
  const [selectedCity, setSelectedCity] = useState<string>(() => {
    return localStorage.getItem('caterconnect_customer_city') || 'All India';
  });
  const [selectedCuisine, setSelectedCuisine] = useState('all');
  const [guestCountFilter, setGuestCountFilter] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [caterers, setCaterers] = useState<(Caterer & { startingPricePaise: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCityPicker, setShowCityPicker] = useState(false);

  const handleSelectCity = (city: string) => {
    setSelectedCity(city);
    localStorage.setItem('caterconnect_customer_city', city);
    setShowCityPicker(false);
  };

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const cityParam = selectedCity === 'All India' ? undefined : selectedCity;
    const cuisineParam = selectedCuisine === 'all' ? undefined : selectedCuisine;

    fetchCaterers({ city: cityParam, cuisine: cuisineParam })
      .then((res) => {
        if (!isMounted) return;
        const mapped = (res.caterers || []).map((c: any) => {
          let minPrice = 18000;
          if (c.packages && c.packages.length > 0) {
            const prices = c.packages
              .map((p: any) => p.pricePerPlatePaise || p.price_per_plate_paise)
              .filter(Boolean);
            if (prices.length > 0) {
              minPrice = Math.min(...prices);
            }
          }
          return {
            id: c.id,
            owner_id: c.ownerId || c.owner_id,
            business_name: c.businessName || c.business_name,
            description: c.description,
            city: c.city || 'Tirupati',
            state: c.state || 'Andhra Pradesh',
            pincode: c.pincode || null,
            address: c.address || null,
            service_areas: c.serviceAreas || c.service_areas || [],
            cuisines: c.cuisines || [],
            fssai_number: c.fssaiNumber || c.fssai_number,
            gst_number: c.gstNumber || c.gst_number,
            status: c.status,
            rejection_reason: c.rejectionReason || null,
            avg_rating: c.avgRating !== undefined ? c.avgRating : 4.8,
            review_count: c.reviewCount !== undefined ? c.reviewCount : 12,
            startingPricePaise: minPrice,
            created_at: c.createdAt || new Date().toISOString(),
            updated_at: c.updatedAt || new Date().toISOString(),
          };
        });
        setCaterers(mapped);
      })
      .catch((err: any) => {
        if (!isMounted) return;
        console.error('Failed to fetch caterers:', err);
        setError('Failed to load caterers for the selected location.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCity, selectedCuisine]);

  const filteredCaterers = caterers.filter((c) => {
    // Guest count capacity check
    if (guestCountFilter !== null) {
      const minG = c.min_guests || 25;
      const maxG = c.max_guests || 3000;
      if (guestCountFilter < minG || guestCountFilter > maxG) {
        return false;
      }
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchesName = c.business_name.toLowerCase().includes(q);
    const matchesDesc = c.description?.toLowerCase().includes(q) || false;
    const matchesCity = c.city.toLowerCase().includes(q);
    const matchesArea = c.service_areas.some((a) => a.toLowerCase().includes(q));
    const matchesCuisine = c.cuisines.some((cuis) => cuis.toLowerCase().includes(q));
    return matchesName || matchesDesc || matchesCity || matchesArea || matchesCuisine;
  });

  return (
    <div className="space-y-6">
      {/* Compact Elegant Hero Banner */}
      <section className="relative rounded-2xl bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 py-6 px-6 sm:px-8 text-white shadow-sm overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200 border border-emerald-600/40">
              <Globe className="h-3 w-3 text-emerald-300" />
              <span>Pan-India Catering Marketplace</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Authentic Caterers {selectedCity === 'All India' ? 'Across India' : `in ${selectedCity}`}
            </h1>
            <p className="text-xs text-emerald-100 max-w-xl">
              Verified FSSAI culinary masters for grand weddings, traditional feasts, and banquets.
            </p>
          </div>

          {/* Quick Location Pills */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <span className="text-[11px] text-emerald-200 font-semibold mr-1">Locations:</span>
            {['All India', 'Tirupati', 'Bengaluru', 'Hyderabad', 'Chennai'].map((city) => (
              <button
                key={city}
                onClick={() => handleSelectCity(city)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  selectedCity === city
                    ? 'bg-white text-emerald-950 shadow-xs font-bold'
                    : 'bg-emerald-800/80 text-emerald-100 hover:bg-emerald-700 border border-emerald-600/40'
                }`}
              >
                {city}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Sticky Interactive Discovery & Filter Menu Bar */}
      <nav className="sticky top-16 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-white/95 backdrop-blur-md border-y border-slate-200/80 shadow-2xs">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Left: City Selector & Search Input */}
          <div className="flex items-center gap-2 w-full md:w-auto flex-1 max-w-xl">
            {/* Location Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCityPicker(!showCityPicker)}
                className="flex items-center gap-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-200 transition shrink-0"
              >
                <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                <span className="truncate max-w-[100px]">{selectedCity}</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {/* City Dropdown Menu */}
              {showCityPicker && (
                <div className="absolute left-0 top-full mt-1.5 z-50 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl text-left animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Operating Hubs
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-0.5">
                    {POPULAR_CATERING_HUBS.map((hub) => (
                      <button
                        key={hub.city}
                        type="button"
                        onClick={() => handleSelectCity(hub.city)}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                          selectedCity === hub.city
                            ? 'bg-emerald-50 text-emerald-800 font-bold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span>{hub.label}</span>
                        {selectedCity === hub.city && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Keyword Search */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search caterer, dish, or cuisine..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition"
              />
            </div>
          </div>

          {/* Right: Guest Count & Cuisines Strip */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Quick Guest Count Filter */}
            <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl border border-slate-200/60 shadow-2xs">
              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500 px-1.5 whitespace-nowrap">
                <Users className="h-3 w-3 text-emerald-600" />
                Guests:
              </span>
              {[
                { val: null, label: 'Any' },
                { val: 50, label: '50' },
                { val: 100, label: '100' },
                { val: 250, label: '250' },
                { val: 500, label: '500+' },
              ].map((g) => (
                <button
                  key={String(g.val)}
                  type="button"
                  onClick={() => setGuestCountFilter(g.val)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
                    guestCountFilter === g.val
                      ? 'bg-emerald-700 text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  {g.label}
                </button>
              ))}

              {/* Direct Custom People Count Input */}
              <div className="flex items-center gap-1 pl-1.5 ml-0.5 border-l border-slate-300/80">
                <input
                  type="number"
                  min="1"
                  max="50000"
                  placeholder="Custom #"
                  value={guestCountFilter && ![50, 100, 250, 500].includes(guestCountFilter) ? guestCountFilter : ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!raw) {
                      setGuestCountFilter(null);
                    } else {
                      const v = parseInt(raw, 10);
                      setGuestCountFilter(isNaN(v) ? null : Math.max(1, v));
                    }
                  }}
                  className="w-20 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold text-emerald-950 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-center shadow-inner"
                  title="Enter exact customized number of guests"
                />
              </div>
            </div>

            {/* Cuisines Horizontal Menu Strip */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              {[
                { id: 'all', label: 'All Feasts' },
                { id: 'andhra', label: 'Andhra' },
                { id: 'south_indian', label: 'South Indian' },
                { id: 'north_indian', label: 'North Indian' },
                { id: 'hyderabadi', label: 'Hyderabadi' },
                { id: 'traditional_meals', label: 'Banana Leaf' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedCuisine(item.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold shrink-0 transition ${
                    selectedCuisine === item.id
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200/80'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* Caterers Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>
                Verified Caterers {selectedCity === 'All India' ? 'Across India' : `in ${selectedCity}`}
              </span>
              <span className="rounded-full bg-slate-100 text-slate-600 text-xs px-2 py-0.5 font-bold">
                {filteredCaterers.length}
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              FSSAI compliant catering services accepting event bookings
            </p>
          </div>

          <Link
            to="/customer/bookings"
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            View My Bookings &rarr;
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 animate-pulse">
                <div className="h-36 bg-slate-100 rounded-lg" />
                <div className="h-4 bg-slate-200 rounded w-2/3" />
                <div className="h-3 bg-slate-100 rounded w-full" />
                <div className="h-8 bg-slate-100 rounded mt-4" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700 text-sm">
            {error}
          </div>
        ) : filteredCaterers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center space-y-3">
            <Utensils className="mx-auto h-10 w-10 text-slate-300" />
            <p className="text-base font-bold text-slate-800">
              No caterers currently found in {selectedCity}
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              We are onboarding new approved caterers across India daily. Try selecting another city or explore all caterers.
            </p>
            <button
              onClick={() => handleSelectCity('All India')}
              className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
            >
              Browse All India Caterers
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCaterers.map((caterer) => (
              <div
                key={caterer.id}
                className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden hover:shadow-md transition"
              >
                <div className="h-36 bg-gradient-to-r from-emerald-100 to-teal-100 flex items-center justify-center text-emerald-800 relative">
                  <span className="text-3xl font-serif font-bold">
                    {caterer.business_name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-white/90 backdrop-blur px-2.5 py-0.5 text-[10px] font-bold text-slate-800 shadow-2xs">
                    <MapPin className="h-3 w-3 text-emerald-600" />
                    <span>
                      {caterer.city}, {caterer.state}
                    </span>
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        Verified FSSAI
                      </span>
                      <div className="flex items-center gap-1 text-xs font-bold text-amber-600">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        <span>
                          {caterer.avg_rating} ({caterer.review_count})
                        </span>
                      </div>
                    </div>

                    <h3 className="mt-2 text-base font-bold text-slate-900">{caterer.business_name}</h3>
                    <p className="mt-1 text-xs text-slate-600 line-clamp-2">{caterer.description}</p>

                    {/* Service Areas & Capacity */}
                    <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                      {caterer.service_areas && caterer.service_areas.length > 0 && (
                        <div>
                          <span className="font-semibold text-slate-700">Servicing: </span>
                          <span>{caterer.service_areas.slice(0, 3).join(', ')}</span>
                          {caterer.service_areas.length > 3 && (
                            <span className="text-emerald-700 font-semibold"> +{caterer.service_areas.length - 3} more</span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-slate-600 font-medium">
                        <Users className="h-3 w-3 text-emerald-600" />
                        <span>Order Capacity: <b>{caterer.min_guests || 25}</b> - <b>{caterer.max_guests || '2,000+'}</b> guests</span>
                      </div>
                    </div>

                    {/* Custom Menu & Hardset Combos Badges */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        🍱 Hardset Combos
                      </span>
                      <span className="rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                        ✨ Custom Menu Builder
                      </span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {caterer.cuisines.map((c) => (
                        <span
                          key={c}
                          className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 capitalize"
                        >
                          {c.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase font-medium">From</span>
                      <span className="text-sm font-bold text-slate-900">
                        {formatPaiseToINR(caterer.startingPricePaise)} / plate
                      </span>
                    </div>
                    <Link
                      to={`/caterer-profile/${caterer.id}`}
                      className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                    >
                      View Menu & Book
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
