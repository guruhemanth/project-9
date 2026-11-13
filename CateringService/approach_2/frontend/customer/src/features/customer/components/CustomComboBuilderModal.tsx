import React, { useState } from 'react';
import { X, Check, Sparkles, AlertCircle, ShoppingBag, Plus, Minus, ArrowRight, Search, Trash2, Utensils } from 'lucide-react';
import { formatPaiseToINR } from '@/lib/formatters';
import type { Caterer, MenuItem, MenuItemCategory, Package, PackageItem } from '@/types/database';

interface CustomComboBuilderModalProps {
  caterer: Caterer;
  menuItems: MenuItem[];
  packages?: (Package & { items: PackageItem[] })[];
  initialSelectedItemId?: string;
  initialSelectedDishIds?: string[];
  initialComboName?: string;
  initialGuestCount?: number;
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
  packages = [],
  initialSelectedItemId,
  initialSelectedDishIds,
  initialComboName,
  initialGuestCount,
  onClose,
  onProceedToBooking,
}) => {
  const [comboName, setComboName] = useState(initialComboName || 'My Custom Feast Combo');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (initialSelectedDishIds && initialSelectedDishIds.length > 0) {
      initialSelectedDishIds.forEach((id) => s.add(id));
    }
    if (initialSelectedItemId) {
      s.add(initialSelectedItemId);
    }
    return s;
  });

  const [guestCount, setGuestCount] = useState<number>(
    initialGuestCount || caterer.min_guests || 50
  );
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dietaryFilter, setDietaryFilter] = useState<'all' | 'veg' | 'non_veg'>('all');
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

  const removeItem = (itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  };

  const clearAllDishes = () => {
    setSelectedItemIds(new Set());
  };

  // Helper to load dishes from a hardset package preset
  const loadPackagePreset = (pkg: Package & { items: PackageItem[] }) => {
    const matched = new Set<string>();
    const lowerMenu = menuItems.map((m) => ({ item: m, nameLower: m.name.toLowerCase() }));

    for (const item of pkg.items) {
      const targetLower = item.name.toLowerCase();
      // Exact or inclusion match
      const exact = lowerMenu.find(
        (m) => m.nameLower === targetLower || m.nameLower.includes(targetLower) || targetLower.includes(m.nameLower)
      );
      if (exact) {
        matched.add(exact.item.id);
        continue;
      }
      // Keyword match
      const words = targetLower.split(/[\s,&]+/).filter((w) => w.length > 3);
      const kw = lowerMenu.find(
        (m) => !matched.has(m.item.id) && words.some((w) => m.nameLower.includes(w))
      );
      if (kw) {
        matched.add(kw.item.id);
        continue;
      }
      // Category fallback
      const catMatch = menuItems.find(
        (m) => !matched.has(m.id) && (m.category === item.category || (item.category === 'main' && m.category === 'bread_rice'))
      );
      if (catMatch) {
        matched.add(catMatch.id);
      }
    }

    if (matched.size === 0 && menuItems.length > 0) {
      menuItems.slice(0, 4).forEach((m) => matched.add(m.id));
    }

    setSelectedItemIds(matched);
    setComboName(`Customized ${pkg.name}`);
    setError(null);
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

  const filteredItems = menuItems.filter((item) => {
    if (activeCategory !== 'all' && item.category !== activeCategory) {
      return false;
    }
    if (dietaryFilter === 'veg' && !item.is_veg) {
      return false;
    }
    if (dietaryFilter === 'non_veg' && item.is_veg) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q) || false;
      if (!matchName && !matchDesc) return false;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 text-white flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-300" />
              <h2 className="text-lg font-bold">Build Your Custom Feast Combo</h2>
              <span className="rounded-full bg-emerald-700/80 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-100 border border-emerald-600/50">
                {selectedItems.length} dishes chosen
              </span>
            </div>
            <p className="text-xs text-emerald-100 mt-0.5">
              Curate individual dishes or start from a fixed preset package from <b>{caterer.business_name}</b>.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-emerald-700/60 transition"
            title="Close builder"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Quick Baseline Package Preset Loaders */}
        {packages.length > 0 && (
          <div className="bg-emerald-50/70 border-b border-emerald-100 px-5 py-2.5 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-emerald-900 flex items-center gap-1">
              <Utensils className="h-3.5 w-3.5 text-emerald-700" />
              Start From Preset:
            </span>
            {packages.map((pkg) => (
              <button
                key={pkg.id}
                type="button"
                onClick={() => loadPackagePreset(pkg)}
                className="rounded-lg bg-white border border-emerald-300 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 transition shadow-2xs"
                title={`Preload dishes from ${pkg.name}`}
              >
                🍱 {pkg.name} ({formatPaiseToINR(pkg.price_per_plate)}/p)
              </button>
            ))}
            {selectedItemIds.size > 0 && (
              <button
                type="button"
                onClick={clearAllDishes}
                className="ml-auto text-[11px] font-bold text-red-600 hover:text-red-700 underline"
              >
                Clear All
              </button>
            )}
          </div>
        )}

        {/* Body Split */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Left Column: Dish Selection */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 border-r border-slate-200 space-y-4">
            {/* Combo Title */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Custom Feast / Event Title</label>
              <input
                type="text"
                value={comboName}
                onChange={(e) => setComboName(e.target.value)}
                placeholder="e.g. Grand Reception Feast Combo"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            {/* Search & Dietary Filters Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search dishes by name or ingredients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Dietary Toggle */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg shrink-0">
                <button
                  type="button"
                  onClick={() => setDietaryFilter('all')}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                    dietaryFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setDietaryFilter('veg')}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition ${
                    dietaryFilter === 'veg' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 inline-block" />
                  Veg Only
                </button>
                <button
                  type="button"
                  onClick={() => setDietaryFilter('non_veg')}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition ${
                    dietaryFilter === 'non_veg' ? 'bg-red-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-red-300 inline-block" />
                  Non-Veg
                </button>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setActiveCategory('all')}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  activeCategory === 'all'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Dishes ({menuItems.length})
              </button>
              {categories.map((cat) => {
                const countInCat = selectedItems.filter((i) => i.category === cat).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition flex items-center gap-1.5 ${
                      activeCategory === cat
                        ? 'bg-emerald-700 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>{CATEGORY_NAMES[cat] || cat}</span>
                    {countInCat > 0 && (
                      <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 font-bold">
                        {countInCat}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Items Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {filteredItems.map((item) => {
                const isSelected = selectedItemIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`rounded-xl border p-3 cursor-pointer transition flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/60 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                            item.is_veg ? 'bg-emerald-600' : 'bg-red-600'
                          }`}
                          title={item.is_veg ? 'Pure Vegetarian' : 'Non-Vegetarian'}
                        />
                        <h4 className="font-bold text-xs text-slate-900 truncate">{item.name}</h4>
                      </div>
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        {CATEGORY_NAMES[item.category] || item.category}
                      </span>
                      {item.description && (
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{item.description}</p>
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
          <div className="w-full md:w-80 lg:w-96 bg-slate-50 p-4 sm:p-5 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3">
                <ShoppingBag className="h-4 w-4 text-emerald-700" />
                Live Custom Feast Estimate
              </h3>

              {/* Guest Count Selector */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="modal-custom-guests" className="text-xs font-semibold text-slate-700">
                    Number of Service Guests
                  </label>
                  <span className="text-[10px] text-slate-400">Min: {minGuests}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setGuestCount((g) => Math.max(minGuests, (g || minGuests) - 25))}
                    className="h-8 w-8 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                    title="Decrease 25 guests"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <input
                    id="modal-custom-guests"
                    type="number"
                    min="1"
                    max={maxGuests}
                    value={guestCount || ''}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setGuestCount(isNaN(v) ? 0 : v);
                    }}
                    placeholder={`e.g. ${minGuests}`}
                    className="flex-1 text-center font-bold text-sm rounded-lg border border-slate-200 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    title="Enter custom number of guests"
                  />
                  <button
                    type="button"
                    onClick={() => setGuestCount((g) => Math.min(maxGuests, (g || 0) + 25))}
                    className="h-8 w-8 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                    title="Increase 25 guests"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* Quick Presets */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {[50, 100, 200, 350, 500].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setGuestCount(preset)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
                        guestCount === preset
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected Dishes Summary with Remove Buttons */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                  <span>Selected Dishes</span>
                  <span className="text-emerald-700 font-bold">{selectedItems.length} items</span>
                </div>

                {selectedItems.length === 0 ? (
                  <p className="text-[11px] text-slate-400 py-2 text-center">
                    Click items on the left or select a preset package to build your feast.
                  </p>
                ) : (
                  <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 text-xs">
                    {selectedItems.map((item) => (
                      <div key={item.id} className="py-1.5 flex items-center justify-between gap-1 group">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                              item.is_veg ? 'bg-emerald-500' : 'bg-red-500'
                            }`}
                          />
                          <span className="truncate text-slate-700">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-slate-600 font-medium">{formatPaiseToINR(item.price_paise)}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeItem(item.id);
                            }}
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

              {/* Expense Ledger */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Base Per-Plate Cost</span>
                  <span className="font-extrabold text-slate-900">{formatPaiseToINR(pricePerPlatePaise)}</span>
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
