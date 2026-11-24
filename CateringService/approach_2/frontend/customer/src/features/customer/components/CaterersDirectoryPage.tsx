import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  MapPin,
  Star,
  Utensils,
  ChevronDown,
  Check,
  Users,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { formatPaiseToINR } from '@/lib/formatters';
import { fetchCaterers } from '../api';
import { POPULAR_CATERING_HUBS } from '@caterconnect/shared';
import type { Caterer } from '@/types/database';

export const CaterersDirectoryPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedCity, setSelectedCity] = useState<string>(() => {
    return searchParams.get('city') || localStorage.getItem('caterconnect_customer_city') || 'All India';
  });
  const [selectedCuisine, setSelectedCuisine] = useState<string>(() => {
    return searchParams.get('cuisine') || 'all';
  });
  const [guestCountFilter, setGuestCountFilter] = useState<number | null>(() => {
    const g = searchParams.get('guests');
    return g ? parseInt(g, 10) : null;
  });
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    return searchParams.get('q') || '';
  });

  const [caterers, setCaterers] = useState<(Caterer & { startingPricePaise: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCityPicker, setShowCityPicker] = useState(false);

  const popularCities = useMemo(() => {
    const list = ['All India', 'Tirupati', 'Bengaluru', 'Hyderabad', 'Chennai', 'Mumbai', 'Delhi', 'Lucknow'];
    if (selectedCity && !list.includes(selectedCity)) {
      return [...list, selectedCity];
    }
    return list;
  }, [selectedCity]);

  const handleSelectCity = (city: string) => {
    setSelectedCity(city);
    localStorage.setItem('caterconnect_customer_city', city);
    setShowCityPicker(false);
    updateParams({ city: city === 'All India' ? null : city });
  };

  const updateParams = (updates: Record<string, string | null>) => {
    const nextParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]) => {
      if (v === null || v === '') {
        nextParams.delete(k);
      } else {
        nextParams.set(k, v);
      }
    });
    setSearchParams(nextParams, { replace: true });
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
            city: c.city || 'Pan-India',
            state: c.state || 'India',
            pincode: c.pincode || null,
            address: c.address || null,
            service_areas: c.serviceAreas || c.service_areas || [],
            cuisines: c.cuisines || [],
            fssai_number: c.fssaiNumber || c.fssai_number,
            gst_number: c.gstNumber || c.gst_number,
            status: c.status,
            rejection_reason: c.rejectionReason || null,
            avg_rating: Number(c.avgRating ?? (c.avg_rating ?? 0)),
            review_count: Number(c.reviewCount ?? (c.review_count ?? 0)),
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
    <div className="space-y-6 pb-12">
      {/* Directory Page Header */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200 mb-2">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>100% Admin &amp; FSSAI Verified Caterers</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Explore Caterers {selectedCity === 'All India' ? 'Across India' : `in ${selectedCity}`}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-600">
              Browse top-rated wedding caterers, traditional feast masters, and corporate banquet partners.
            </p>
          </div>

          {/* Location Quick Switcher */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <span className="text-xs text-slate-500 font-semibold mr-1">Hubs:</span>
            {popularCities.map((city: string) => (
              <button
                key={city}
                onClick={() => handleSelectCity(city)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  selectedCity === city
                    ? 'bg-emerald-700 text-white shadow-xs font-bold'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {city}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="sticky top-16 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-white/95 backdrop-blur-md border-y border-slate-200/80 shadow-2xs">
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
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  updateParams({ q: e.target.value || null });
                }}
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
                  onClick={() => {
                    setGuestCountFilter(g.val);
                    updateParams({ guests: g.val ? String(g.val) : null });
                  }}
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
                    guestCountFilter === g.val
                      ? 'bg-emerald-700 text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  {g.label}
                </button>
              ))}

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
                      updateParams({ guests: null });
                    } else {
                      const val = parseInt(raw, 10);
                      setGuestCountFilter(isNaN(val) ? null : val);
                      updateParams({ guests: isNaN(val) ? null : String(val) });
                    }
                  }}
                  className="w-16 rounded-md bg-white border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Quick Cuisine Filter */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
              {[
                { id: 'all', label: 'All Cuisines' },
                { id: 'south_indian', label: 'South Indian' },
                { id: 'north_indian', label: 'North Indian' },
                { id: 'andhra', label: 'Andhra' },
                { id: 'biryani', label: 'Biryani & Mughlai' },
                { id: 'desserts', label: 'Sweets & Desserts' },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedCuisine(c.id);
                    updateParams({ cuisine: c.id === 'all' ? null : c.id });
                  }}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition shrink-0 ${
                    selectedCuisine === c.id
                      ? 'bg-emerald-700 text-white shadow-2xs font-bold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Caterers Grid or States */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Verified Caterers
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {filteredCaterers.length} available
            </span>
          </div>

          {(selectedCuisine !== 'all' || guestCountFilter !== null || searchQuery) && (
            <button
              onClick={() => {
                setSelectedCuisine('all');
                setGuestCountFilter(null);
                setSearchQuery('');
                setSearchParams({});
              }}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition"
            >
              Reset Filters
            </button>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-72 rounded-xl border border-slate-200 bg-white p-4 animate-pulse space-y-4"
              >
                <div className="h-36 rounded-lg bg-slate-100" />
                <div className="h-4 w-2/3 rounded bg-slate-100" />
                <div className="h-3 w-1/2 rounded bg-slate-100" />
                <div className="h-8 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-xs text-red-700">
            {error}
          </div>
        ) : filteredCaterers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center space-y-3">
            <Utensils className="mx-auto h-8 w-8 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-800">
              No caterers currently match your criteria in {selectedCity}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Try adjusting your guest capacity, selecting another cuisine, or searching across all cities in India.
            </p>
            <button
              onClick={() => {
                setSelectedCity('All India');
                setSelectedCuisine('all');
                setGuestCountFilter(null);
                setSearchQuery('');
                setSearchParams({});
              }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition shadow-xs"
            >
              <span>Explore All India Caterers</span>
              <ArrowRight className="h-3.5 w-3.5" />
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
                          {caterer.review_count > 0 ? `${Number(caterer.avg_rating).toFixed(1)} (${caterer.review_count})` : 'New'}
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
                      View Menu &amp; Book
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
