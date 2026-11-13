import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { Star, MapPin, Check, Sparkles } from 'lucide-react';
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

  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
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
          setCaterer({
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
          });

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
    }
  };

  const handleBookingCreated = (_booking: Booking) => {
    setSelectedPackage(null);
    setBookingSuccess(true);
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link to="/" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">
          &larr; Back to all caterers
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
                <span>Areas: {caterer.service_areas.join(', ')}</span>
              </div>
            </div>
          </div>
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
              Don't want fixed packages? Handpick your favorite starters, main curries, breads, and desserts from {caterer.business_name}'s {menuItems.length} kitchen recipes with instant live per-plate pricing!
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowComboBuilder(true)}
            className="rounded-xl bg-emerald-700 px-6 py-3 text-xs font-bold text-white shadow-md hover:bg-emerald-800 transition shrink-0"
          >
            Customize Feast Plate
          </button>
        </div>
      )}

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
                  onClick={() => handleRequestToBook(pkg)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
                >
                  Request to Book
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Combo Builder Modal */}
      {showComboBuilder && (
        <CustomComboBuilderModal
          caterer={caterer}
          menuItems={menuItems}
          onClose={() => setShowComboBuilder(false)}
          onProceedToBooking={(customCombo) => {
            setShowComboBuilder(false);
            const synthesizedPkg: Package = {
              id: 'custom-combo-package',
              caterer_id: caterer.id,
              name: customCombo.comboName,
              description: `Custom feast with ${customCombo.selectedItems.length} selected kitchen dishes.`,
              price_per_plate: customCombo.pricePerPlatePaise,
              min_guests: caterer.min_guests || 25,
              max_guests: caterer.max_guests ?? null,
              is_veg: customCombo.selectedItems.every((i) => i.is_veg),
              is_active: true,
              created_at: new Date().toISOString(),
            };
            handleRequestToBook(synthesizedPkg);
          }}
        />
      )}

      {/* Booking Modal (Authenticated Only) */}
      {selectedPackage && user && (
        <BookingRequestModal
          caterer={caterer}
          packageItem={selectedPackage}
          customerId={user.id}
          onClose={() => setSelectedPackage(null)}
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
