import React, { useState } from 'react';
import { X, Check, Sparkles, AlertCircle, ShoppingBag, Plus, Minus, ArrowRight } from 'lucide-react';
import { formatPaiseToINR } from '@/lib/formatters';
import type { Caterer, MenuItem, MenuItemCategory } from '@/types/database';

interface CustomComboBuilderModalProps {
  caterer: Caterer;
  menuItems: MenuItem[];
  onClose: () => void;
  onProceedToBooking: (combo: {
    comboName: string;
    selectedItems: MenuItem[];
    pricePerPlatePaise: number;
    guestCount: number;
  }) => void;
}

const CATEGORY_NAMES: Record<MenuItemCategory, string> = {
  welcome_drink: 'Welcome Drinks',
  starter: 'Starters',
  main: 'Curries & Dal',
  bread_rice: 'Breads & Rice',
  dessert: 'Sweets & Desserts',
  beverage: 'Beverages',
  accompaniment: 'Accompaniments',
};

export const CustomComboBuilderModal: React.FC<CustomComboBuilderModalProps> = ({
  caterer,
  menuItems,
  onClose,
  onProceedToBooking,
}) => {
  const [comboName, setComboName] = useState('My Custom Wedding Feast');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [guestCount, setGuestCount] = useState<number>(caterer.min_guests || 50);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  const toggleItem = (itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const selectedItems = menuItems.filter((item) => selectedItemIds.has(item.id));

  // Dynamic plate price calculation (sum of selected items)
  const pricePerPlatePaise = selectedItems.reduce((acc, item) => acc + item.price_paise, 0);
  const totalCostPaise = pricePerPlatePaise * guestCount;

  // 25% Advance vs 75% Balance
  const advancePaymentPaise = Math.round(totalCostPaise * 0.25);
  const balancePaymentPaise = totalCostPaise - advancePaymentPaise;

  const minGuests = caterer.min_guests || 25;
  const maxGuests = caterer.max_guests || 2000;

  const handleCheckout = () => {
    if (selectedItems.length === 0) {
      setError('Please select at least 1 dish to create your custom combo.');
      return;
    }
    if (guestCount < minGuests) {
      setError(`Minimum order is ${minGuests} guests for ${caterer.business_name}.`);
      return;
    }
    if (guestCount > maxGuests) {
      setError(`Maximum capacity is ${maxGuests} guests.`);
      return;
    }

    onProceedToBooking({
      comboName: comboName.trim() || 'Custom Feast Package',
      selectedItems,
      pricePerPlatePaise,
      guestCount,
    });
  };

  const categories = Array.from(new Set(menuItems.map((i) => i.category))) as MenuItemCategory[];

  const filteredItems = activeCategory === 'all'
    ? menuItems
    : menuItems.filter((i) => i.category === activeCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-emerald-800 text-white flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-200" />
              <h2 className="text-lg font-bold">Build Your Own Custom Feast Combo</h2>
            </div>
            <p className="text-xs text-emerald-100 mt-0.5">
              Select your favorite dishes from <b>{caterer.business_name}</b>'s kitchen catalog.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-emerald-100 hover:text-white hover:bg-emerald-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Body Split */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Left Column: Dish Selection */}
          <div className="flex-1 overflow-y-auto p-5 border-r border-slate-200 space-y-4">
            {/* Combo Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Package / Event Title</label>
              <input
                type="text"
                value={comboName}
                onChange={(e) => setComboName(e.target.value)}
                placeholder="e.g. Ramesh & Sneha Wedding Feast"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-1.5 pt-2">
              <button
                onClick={() => setActiveCategory('all')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeCategory === 'all'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Dishes ({menuItems.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    activeCategory === cat
                      ? 'bg-emerald-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {CATEGORY_NAMES[cat] || cat}
                </button>
              ))}
            </div>

            {/* Items Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {filteredItems.map((item) => {
                const isSelected = selectedItemIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`rounded-xl border p-3.5 cursor-pointer transition flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/50 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            item.is_veg ? 'bg-emerald-600' : 'bg-red-600'
                          }`}
                        />
                        <h4 className="font-bold text-xs text-slate-900 truncate">{item.name}</h4>
                      </div>
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        {CATEGORY_NAMES[item.category] || item.category}
                      </span>
                      {item.description && (
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{item.description}</p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-bold text-xs text-emerald-800 block">
                        +{formatPaiseToINR(item.price_paise)}
                      </span>
                      <div className="mt-2 flex justify-end">
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
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Live Expense Breakdown & Plate Calculator */}
          <div className="w-full md:w-80 lg:w-96 bg-slate-50 p-5 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3">
                <ShoppingBag className="h-4 w-4 text-emerald-700" />
                Live Feast Plate Estimate
              </h3>

              {/* Guest Count Selector */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">Total Guest Count</label>
                  <span className="text-[10px] text-slate-400">Min: {minGuests} guests</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setGuestCount((g) => Math.max(minGuests, g - 25))}
                    className="h-8 w-8 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <input
                    type="number"
                    min={minGuests}
                    max={maxGuests}
                    value={guestCount}
                    onChange={(e) => setGuestCount(parseInt(e.target.value, 10) || minGuests)}
                    className="flex-1 text-center font-bold text-sm rounded-lg border border-slate-200 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setGuestCount((g) => Math.min(maxGuests, g + 25))}
                    className="h-8 w-8 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Selected Dishes Summary */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                  <span>Selected Dishes</span>
                  <span className="text-emerald-700">{selectedItems.length} items</span>
                </div>

                {selectedItems.length === 0 ? (
                  <p className="text-[11px] text-slate-400 py-2 text-center">
                    Click items on the left to add them to your feast plate.
                  </p>
                ) : (
                  <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 text-xs">
                    {selectedItems.map((item) => (
                      <div key={item.id} className="py-1.5 flex items-center justify-between">
                        <span className="truncate pr-2 text-slate-700">{item.name}</span>
                        <span className="text-slate-500 shrink-0">{formatPaiseToINR(item.price_paise)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Expense Ledger */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Base Per-Plate Cost</span>
                  <span className="font-semibold text-slate-900">{formatPaiseToINR(pricePerPlatePaise)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Guests Multiplier</span>
                  <span>× {guestCount}</span>
                </div>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between font-bold text-sm text-slate-900">
                  <span>Gross Event Total</span>
                  <span className="text-emerald-800">{formatPaiseToINR(totalCostPaise)}</span>
                </div>

                <div className="pt-2 border-t border-dashed border-slate-200 space-y-1 text-[11px]">
                  <div className="flex items-center justify-between text-emerald-700 font-semibold">
                    <span>25% Advance to Lock Date:</span>
                    <span>{formatPaiseToINR(advancePaymentPaise)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500">
                    <span>75% Balance on Event Day:</span>
                    <span>{formatPaiseToINR(balancePaymentPaise)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleCheckout}
                disabled={selectedItems.length === 0}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 transition disabled:opacity-50"
              >
                <span>Proceed to Book Custom Feast</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
