import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  MapPin,
  Star,
  Utensils,
  ChevronDown,
  Check,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  HeartHandshake,
} from 'lucide-react';
import { formatPaiseToINR } from '@/lib/formatters';
import { fetchCaterers } from './api';
import { POPULAR_CATERING_HUBS } from '@caterconnect/shared';
import type { Caterer } from '@/types/database';

export const CustomerHome: React.FC = () => {
  const navigate = useNavigate();

  const [selectedCity, setSelectedCity] = useState<string>(() => {
    return localStorage.getItem('caterconnect_customer_city') || 'All India';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [caterers, setCaterers] = useState<(Caterer & { startingPricePaise: number })[]>([]);
  const [loading, setLoading] = useState(true);
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
  };

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const cityParam = selectedCity === 'All India' ? undefined : selectedCity;

    fetchCaterers({ city: cityParam })
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
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCity]);

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (selectedCity && selectedCity !== 'All India') {
      params.set('city', selectedCity);
    }
    if (searchQuery.trim()) {
      params.set('q', searchQuery.trim());
    }
    navigate(`/caterers?${params.toString()}`);
  };

  const featuredCaterers = caterers.slice(0, 3);

  return (
    <div className="space-y-10 pb-16">
      {/* High-Converting Hero Section */}
      <section className="relative rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 py-12 px-6 sm:px-12 text-white shadow-lg overflow-hidden">
        {/* Subtle decorative background circles */}
        <div className="absolute -right-20 -bottom-20 h-80 w-80 rounded-full bg-emerald-600/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-800/80 px-3 py-1 text-xs font-semibold text-emerald-200 border border-emerald-600/50 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            <span>India's Verified Catering Marketplace</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Order Exceptional Food for Your Weddings, Parties &amp; Events
          </h1>

          <p className="text-sm sm:text-base text-emerald-100 max-w-2xl leading-relaxed">
            Directly connect with FSSAI-certified caterers across India. Customize combos, book authentic feast chefs, and track orders in real-time.
          </p>

          {/* Quick Search & Location Bar */}
          <form
            onSubmit={handleHeroSearch}
            className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-2xl bg-white p-2 shadow-xl border border-slate-200/80 text-slate-900"
          >
            {/* City Selector */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowCityPicker(!showCityPicker)}
                className="flex w-full sm:w-auto items-center justify-between gap-2 rounded-xl bg-slate-50 hover:bg-slate-100 px-3.5 py-2.5 text-xs font-semibold text-slate-800 border border-slate-200 transition"
              >
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-emerald-600" />
                  <span className="truncate max-w-[120px]">{selectedCity}</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {showCityPicker && (
                <div className="absolute left-0 top-full mt-1.5 z-50 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl text-left animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Popular Hubs
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

            {/* Keyword Input */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Biryani, South Indian, Wedding Feast, or Caterer name..."
                className="w-full rounded-xl py-2 pl-10 pr-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            {/* Action CTA */}
            <button
              type="submit"
              className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-emerald-700 transition shrink-0"
            >
              <span>Explore Caterers</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Location Quick Tags */}
          <div className="pt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-emerald-200 font-medium">Quick Hubs:</span>
            {popularCities.map((city: string) => (
              <button
                key={city}
                onClick={() => handleSelectCity(city)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                  selectedCity === city
                    ? 'bg-white text-emerald-950 font-bold'
                    : 'bg-emerald-900/60 text-emerald-200 hover:bg-emerald-800 border border-emerald-700/50'
                }`}
              >
                {city}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Value Proposition Highlights */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Verified FSSAI Standards</h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Every catering kitchen is identity-checked with active FSSAI and hygiene documentation.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Custom Combos &amp; Menus</h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Mix and match starters, main courses, and desserts or choose curated packages.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <HeartHandshake className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Safe Dual Payments</h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Lock your date with 25% advance or 100% full payment, secured via Razorpay UPI &amp; Cards.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Caterers Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
              Featured Caterers in {selectedCity}
            </h2>
            <p className="text-xs text-slate-500">
              Top culinary specialists available for your upcoming dates
            </p>
          </div>
          <Link
            to={`/caterers?city=${selectedCity === 'All India' ? '' : selectedCity}`}
            className="flex items-center gap-1 text-xs sm:text-sm font-bold text-emerald-700 hover:text-emerald-800 transition"
          >
            <span>View All ({caterers.length})</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 rounded-xl border border-slate-200 bg-white p-4 animate-pulse space-y-3">
                <div className="h-32 rounded bg-slate-100" />
                <div className="h-4 w-2/3 rounded bg-slate-100" />
                <div className="h-3 w-1/2 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : featuredCaterers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-2">
            <Utensils className="mx-auto h-8 w-8 text-slate-400" />
            <p className="text-xs font-semibold text-slate-700">No caterers currently featured in {selectedCity}.</p>
            <Link
              to="/caterers"
              className="inline-block text-xs font-bold text-emerald-700 hover:underline"
            >
              Browse All India Caterers &rarr;
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {featuredCaterers.map((caterer) => (
              <div
                key={caterer.id}
                className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden hover:shadow-md transition"
              >
                <div className="h-32 bg-gradient-to-r from-emerald-100 to-teal-100 flex items-center justify-center text-emerald-800 relative">
                  <span className="text-3xl font-serif font-bold">
                    {caterer.business_name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-0.5 text-[10px] font-bold text-slate-800 shadow-2xs">
                    <MapPin className="h-3 w-3 text-emerald-600" />
                    <span>{caterer.city}</span>
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        Verified
                      </span>
                      <div className="flex items-center gap-1 text-xs font-bold text-amber-600">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        <span>{caterer.review_count > 0 ? Number(caterer.avg_rating).toFixed(1) : 'New'}</span>
                      </div>
                    </div>

                    <h3 className="mt-2 text-sm font-bold text-slate-900">{caterer.business_name}</h3>
                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">{caterer.description}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase font-medium">Starts At</span>
                      <span className="text-xs font-bold text-slate-900">
                        {formatPaiseToINR(caterer.startingPricePaise)} / plate
                      </span>
                    </div>
                    <Link
                      to={`/caterer-profile/${caterer.id}`}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                    >
                      View Menu
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Direct Callout to Directory */}
      <section className="rounded-2xl bg-slate-900 p-6 sm:p-8 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-base sm:text-lg font-bold">Looking for specific event packages or live cooking stalls?</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Filter by South Indian, North Indian, Andhra, Biryani, and dietary constraints with instant price calculations.
          </p>
        </div>
        <Link
          to="/caterers"
          className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm px-5 py-3 transition shadow-sm"
        >
          <Utensils className="h-4 w-4" />
          <span>Browse All Caterers Directory</span>
        </Link>
      </section>
    </div>
  );
};
