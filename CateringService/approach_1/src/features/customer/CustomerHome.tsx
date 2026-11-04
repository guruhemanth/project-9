import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, MapPin, Star, Utensils, Filter } from 'lucide-react';
import { formatPaiseToINR } from '@/lib/formatters';
import type { Caterer } from '@/types/database';

export const CustomerHome: React.FC = () => {
  const [selectedCuisine, setSelectedCuisine] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [caterers] = useState<(Caterer & { startingPricePaise: number })[]>([
    {
      id: 'd0000000-0000-0000-0000-000000000001',
      owner_id: 'c0000000-0000-0000-0000-000000000002',
      business_name: 'Sri Venkateswara Catering Services',
      description: 'Authentic Andhra & South Indian traditional wedding and event feasts in Tirupati.',
      city: 'Tirupati',
      service_areas: ['Alipiri', 'MR Palli', 'Bhavani Nagar', 'Chandragiri', 'Renigunta'],
      cuisines: ['andhra', 'south_indian', 'traditional_meals'],
      fssai_number: '10123000004567',
      gst_number: '37AAAAA0000A1Z5',
      status: 'approved',
      rejection_reason: null,
      avg_rating: 4.8,
      review_count: 12,
      startingPricePaise: 18000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'd0000000-0000-0000-0000-000000000005',
      owner_id: 'c0000000-0000-0000-0000-000000000005',
      business_name: 'Sapthagiri Grand Feast',
      description: 'Grand vegetarian wedding arrangements, banana leaf catering, and evening snacks counter.',
      city: 'Tirupati',
      service_areas: ['Alipiri', 'AIR Bypass Road', 'Korlagunta'],
      cuisines: ['south_indian', 'traditional_meals'],
      fssai_number: '10123000009988',
      gst_number: null,
      status: 'approved',
      rejection_reason: null,
      avg_rating: 4.9,
      review_count: 24,
      startingPricePaise: 25000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  const filteredCaterers = caterers.filter((c) => {
    const matchesCuisine =
      selectedCuisine === 'all' || c.cuisines.includes(selectedCuisine);
    const matchesSearch =
      c.business_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCuisine && matchesSearch;
  });

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="rounded-2xl bg-gradient-to-br from-emerald-800 to-teal-900 py-12 px-6 text-white shadow-md sm:px-12 sm:py-16 text-center">
        <h1 className="text-3xl font-extrabold sm:text-4xl tracking-tight">
          Find Authentic Caterers in Tirupati
        </h1>
        <p className="mt-3 text-emerald-100 max-w-xl mx-auto text-sm sm:text-base">
          Verified FSSAI catering services for weddings, housewarmings, birthdays, and family gatherings.
        </p>

        {/* Search Bar */}
        <div className="mt-8 mx-auto flex max-w-lg items-center rounded-xl bg-white p-2 shadow-lg text-slate-800">
          <MapPin className="ml-2 h-5 w-5 text-emerald-600 shrink-0" />
          <input
            type="text"
            readOnly
            value="Tirupati, AP"
            className="w-28 sm:w-32 bg-transparent px-2 text-xs sm:text-sm font-semibold outline-none cursor-default border-r border-slate-200"
          />
          <Search className="ml-3 h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search caterer name or cuisine..."
            className="w-full bg-transparent px-2 text-xs sm:text-sm outline-none"
          />
        </div>
      </section>

      {/* Cuisines Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <Filter className="h-4 w-4 text-slate-400 shrink-0" />
        <button
          onClick={() => setSelectedCuisine('all')}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold shrink-0 transition ${
            selectedCuisine === 'all'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          All Cuisines
        </button>
        <button
          onClick={() => setSelectedCuisine('andhra')}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold shrink-0 transition ${
            selectedCuisine === 'andhra'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Andhra Traditional
        </button>
        <button
          onClick={() => setSelectedCuisine('south_indian')}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold shrink-0 transition ${
            selectedCuisine === 'south_indian'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          South Indian
        </button>
        <button
          onClick={() => setSelectedCuisine('traditional_meals')}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold shrink-0 transition ${
            selectedCuisine === 'traditional_meals'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Banana Leaf Feasts
        </button>
      </div>

      {/* Caterers Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            Verified Caterers in Tirupati ({filteredCaterers.length})
          </h2>
          <Link
            to="/customer/bookings"
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            View My Bookings &rarr;
          </Link>
        </div>

        {filteredCaterers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center">
            <Utensils className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-700">No caterers match your search</p>
            <p className="text-xs text-slate-400">Try adjusting your filters or search keywords.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCaterers.map((caterer) => (
              <div
                key={caterer.id}
                className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden hover:shadow-md transition"
              >
                <div className="h-36 bg-gradient-to-r from-emerald-100 to-teal-100 flex items-center justify-center text-emerald-800">
                  <span className="text-3xl font-serif font-bold">
                    {caterer.business_name.slice(0, 2).toUpperCase()}
                  </span>
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

                    <div className="mt-3 flex flex-wrap gap-1">
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
