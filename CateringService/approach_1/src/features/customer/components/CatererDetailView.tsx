import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { Star, MapPin, Check } from 'lucide-react';
import { formatPaiseToINR } from '@/lib/formatters';
import { BookingRequestModal } from './BookingRequestModal';
import type { Caterer, Package, PackageItem, Booking } from '@/types/database';

export const CatererDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  // Data
  const [caterer] = useState<Caterer>({
    id: id || 'd0000000-0000-0000-0000-000000000001',
    owner_id: 'c0000000-0000-0000-0000-000000000002',
    business_name: 'Sri Venkateswara Catering Services',
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const [packages] = useState<(Package & { items: PackageItem[] })[]>([
    {
      id: 'e0000000-0000-0000-0000-000000000001',
      caterer_id: 'd0000000-0000-0000-0000-000000000001',
      name: 'Grand Tirupati Wedding Feast',
      description: 'Full traditional 18-course meal served on fresh plantain leaf with Tirupati Laddu sweet.',
      price_per_plate: 35000,
      min_guests: 50,
      max_guests: 1000,
      is_veg: true,
      is_active: true,
      created_at: new Date().toISOString(),
      items: [
        { id: '1', package_id: 'e1', name: 'Poori & Potato Masala', category: 'starter' },
        { id: '2', package_id: 'e1', name: 'Gutti Vankaya Curry', category: 'main' },
        { id: '3', package_id: 'e1', name: 'Andhra Tomato Pappu with Ghee', category: 'main' },
        { id: '4', package_id: 'e1', name: 'Authentic Sambar & Rasam', category: 'main' },
        { id: '5', package_id: 'e1', name: 'Tirupati Style Besan Laddu', category: 'dessert' },
        { id: '6', package_id: 'e1', name: 'Masala Buttermilk', category: 'beverage' },
      ],
    },
    {
      id: 'e0000000-0000-0000-0000-000000000002',
      caterer_id: 'd0000000-0000-0000-0000-000000000001',
      name: 'South Indian Breakfast & Tiffin Counter',
      description: 'Live dosa counter, idli, vada, pongal with 3 chutneys and hot filter coffee.',
      price_per_plate: 18000,
      min_guests: 30,
      max_guests: 500,
      is_veg: true,
      is_active: true,
      created_at: new Date().toISOString(),
      items: [
        { id: '7', package_id: 'e2', name: 'Steamed Idli with Sambar', category: 'main' },
        { id: '8', package_id: 'e2', name: 'Crispy Medu Vada', category: 'main' },
        { id: '9', package_id: 'e2', name: 'Live Ghee Karam Dosa', category: 'starter' },
        { id: '10', package_id: 'e2', name: 'Hot Filter Coffee', category: 'beverage' },
      ],
    },
  ]);

  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  const handleBookingCreated = (_booking: Booking) => {
    setSelectedPackage(null);
    setBookingSuccess(true);
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link to="/" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">
          &larr; Back to all caterers in Tirupati
        </Link>
      </div>

      {bookingSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold">Booking Request Sent!</h4>
            <p className="text-xs text-emerald-800 mt-0.5">
              Your request has reached the caterer. You will be notified once they accept.
            </p>
          </div>
          <Link
            to="/customer/bookings"
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            View My Bookings
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
                Tirupati, AP
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
                <span>Areas: {caterer.service_areas.join(', ')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Packages Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Available Catering Packages ({packages.length})</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between"
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

                <div className="mt-3 text-xs text-slate-500">
                  <span>Minimum guests: <b>{pkg.min_guests}</b></span>
                  {pkg.max_guests && <span> • Max: <b>{pkg.max_guests}</b></span>}
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
                <span className="text-xs text-slate-500">Instant request submission</span>
                <button
                  type="button"
                  onClick={() => setSelectedPackage(pkg)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
                >
                  Request to Book
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Booking Modal */}
      {selectedPackage && (
        <BookingRequestModal
          caterer={caterer}
          packageItem={selectedPackage}
          customerId={user?.id || 'c0000000-0000-0000-0000-000000000001'}
          onClose={() => setSelectedPackage(null)}
          onSuccess={handleBookingCreated}
        />
      )}
    </div>
  );
};
