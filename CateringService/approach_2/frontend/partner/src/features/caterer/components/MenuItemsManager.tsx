import React, { useState, useEffect } from 'react';
import { Plus, Trash2, ToggleLeft, ToggleRight, Utensils, Sparkles, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatPaiseToINR } from '@/lib/formatters';
import type { MenuItem, MenuItemCategory } from '@/types/database';

interface MenuItemsManagerProps {
  catererId: string;
}

const CATEGORIES: { label: string; value: MenuItemCategory }[] = [
  { label: 'Welcome Drinks', value: 'welcome_drink' },
  { label: 'Starters', value: 'starter' },
  { label: 'Main Curries & Dal', value: 'main' },
  { label: 'Breads & Rice', value: 'bread_rice' },
  { label: 'Desserts & Sweets', value: 'dessert' },
  { label: 'Beverages', value: 'beverage' },
  { label: 'Accompaniments & Chutneys', value: 'accompaniment' },
];

export const MenuItemsManager: React.FC<MenuItemsManagerProps> = ({ catererId }) => {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MenuItemCategory>('starter');
  const [priceRupees, setPriceRupees] = useState<string>('50');
  const [isVeg, setIsVeg] = useState(true);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch<{ items: MenuItem[] }>(`/api/caterers/${catererId}/items`);
      setItems(res.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load menu items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (catererId) {
      fetchItems();
    }
  }, [catererId]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const pricePaise = Math.round(parseFloat(priceRupees || '0') * 100);
      const res = await apiFetch<{ item: MenuItem }>(`/api/caterers/${catererId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          category,
          pricePaise,
          isVeg,
          description: description.trim() || undefined,
        }),
      });

      setItems((prev) => [...prev, res.item]);
      setName('');
      setDescription('');
      setShowAddForm(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save menu item');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAvailability = async (itemId: string) => {
    try {
      const res = await apiFetch<{ item: MenuItem }>(`/api/caterers/${catererId}/items/${itemId}/toggle-availability`, {
        method: 'PATCH',
      });
      setItems((prev) => prev.map((item) => (item.id === itemId ? res.item : item)));
    } catch (err: any) {
      alert(err.message || 'Failed to update item availability');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this menu dish?')) return;
    try {
      await apiFetch(`/api/caterers/${catererId}/items/${itemId}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err: any) {
      alert(err.message || 'Failed to delete dish');
    }
  };

  const filteredItems = selectedCategory === 'all'
    ? items
    : items.filter((i) => i.category === selectedCategory);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Utensils className="h-5 w-5 text-amber-600" />
            Individual Menu Catalog ({items.length} items)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your master à la carte dishes. Customers can choose these for customized feast combos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition"
        >
          <Plus className="h-4 w-4" />
          <span>{showAddForm ? 'Close Form' : 'Add New Dish'}</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Add New Dish Form Modal / In-place */}
      {showAddForm && (
        <form onSubmit={handleAddItem} className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-amber-900 text-sm">
            <Sparkles className="h-4 w-4" />
            <span>Add Single Dish / Recipe to Kitchen Catalog</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Dish Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Tirupati Ghee Pongal"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MenuItemCategory)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Price per Plate (₹) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                <input
                  type="number"
                  required
                  min="0"
                  step="1"
                  value={priceRupees}
                  onChange={(e) => setPriceRupees(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white pl-7 pr-3 py-2 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="isVegCheckbox"
                checked={isVeg}
                onChange={(e) => setIsVeg(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="isVegCheckbox" className="text-xs font-medium text-slate-700">
                100% Pure Vegetarian Dish
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Brief Description (Optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Prepared with whole cashews, peppercorns, and pure cow ghee"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save to Menu'}
            </button>
          </div>
        </form>
      )}

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            selectedCategory === 'all'
              ? 'bg-amber-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          All Items ({items.length})
        </button>
        {CATEGORIES.map((c) => {
          const count = items.filter((i) => i.category === c.value).length;
          return (
            <button
              key={c.value}
              onClick={() => setSelectedCategory(c.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                selectedCategory === c.value
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Items Grid */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">Loading master menu...</div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
          No dishes added in this category yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`rounded-xl border p-4 transition bg-white shadow-xs ${
                item.is_available ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        item.is_veg ? 'bg-emerald-600' : 'bg-red-600'
                      }`}
                      title={item.is_veg ? 'Vegetarian' : 'Non-Vegetarian'}
                    />
                    <h4 className="font-bold text-sm text-slate-900">{item.name}</h4>
                  </div>
                  <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">
                    {item.category.replace('_', ' ')}
                  </span>
                </div>

                <span className="font-bold text-emerald-700 text-sm">
                  {formatPaiseToINR(item.price_paise)}
                </span>
              </div>

              {item.description && (
                <p className="mt-2 text-xs text-slate-500 line-clamp-2">{item.description}</p>
              )}

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleToggleAvailability(item.id)}
                  className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900"
                >
                  {item.is_available ? (
                    <>
                      <ToggleRight className="h-4 w-4 text-emerald-600" />
                      <span className="text-emerald-700 font-medium">Serving Today</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-400">Sold Out / Off</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteItem(item.id)}
                  className="p-1 text-slate-400 hover:text-red-600 transition"
                  title="Remove dish"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
