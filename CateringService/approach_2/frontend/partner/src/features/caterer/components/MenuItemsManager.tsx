import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Utensils,
  Sparkles,
  AlertCircle,
  Camera,
  Upload,
  Image as ImageIcon,
  Check,
  X,
} from 'lucide-react';
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

// Curated high quality food photography presets caterers can quickly click to apply
const SAMPLE_PRESETS: { label: string; url: string }[] = [
  { label: 'Paneer Tikka', url: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80' },
  { label: 'Biryani Rice', url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80' },
  { label: 'Curry / Dal', url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80' },
  { label: 'Gulab Jamun', url: 'https://images.unsplash.com/photo-1589301773859-bb0d43a6aa9b?auto=format&fit=crop&w=600&q=80' },
  { label: 'Beverage / Shake', url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80' },
  { label: 'Crispy Starter', url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80' },
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
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit Photo Modal State
  const [editingPhotoItem, setEditingPhotoItem] = useState<MenuItem | null>(null);
  const [editingPhotoUrl, setEditingPhotoUrl] = useState('');
  const [savingPhoto, setSavingPhoto] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

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

  // Helper to compress and convert image file to optimized base64 Data URL
  const processImageFile = (file: File, onSuccess: (dataUrl: string) => void) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (JPEG, PNG, WebP)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        onSuccess(dataUrl);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

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
          imageUrl: imageUrl.trim() || undefined,
        }),
      });

      setItems((prev) => [...prev, res.item]);
      setName('');
      setDescription('');
      setImageUrl('');
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

  const openPhotoModal = (item: MenuItem) => {
    setEditingPhotoItem(item);
    setEditingPhotoUrl(item.image_url || '');
  };

  const handleSavePhotoModal = async () => {
    if (!editingPhotoItem) return;
    setSavingPhoto(true);
    try {
      const res = await apiFetch<{ item: MenuItem }>(`/api/caterers/${catererId}/items/${editingPhotoItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          imageUrl: editingPhotoUrl.trim() || null,
        }),
      });

      setItems((prev) =>
        prev.map((i) => (i.id === editingPhotoItem.id ? { ...i, image_url: res.item.image_url } : i))
      );
      setEditingPhotoItem(null);
    } catch (err: any) {
      alert(err.message || 'Failed to update dish photo');
    } finally {
      setSavingPhoto(false);
    }
  };

  const filteredItems = selectedCategory === 'all'
    ? items
    : items.filter((i) => i.category === selectedCategory);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Utensils className="h-5 w-5 text-amber-600" />
            <span>Master Kitchen Catalog & Dishes ({items.length})</span>
          </h2>
          <p className="text-xs text-slate-500">
            Manage your master à la carte dishes and photos. Customers can browse these in your live menu and customized feast combos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition self-start sm:self-auto shadow-2xs"
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
          <div className="flex items-center gap-2 font-semibold text-amber-900 text-sm border-b border-amber-200/60 pb-2">
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
                placeholder="e.g. Special Ghee Pongal / Shahi Paneer"
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

          {/* Dish Image Upload & URL Section */}
          <div className="rounded-xl border border-dashed border-amber-300 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Camera className="h-4 w-4 text-amber-600" />
                <span>Upload Dish Image (Displays to Customers)</span>
              </label>
              <span className="text-[11px] text-slate-400">Supports direct upload (JPG/PNG) or Image URL</span>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              {/* Image Preview Thumbnail */}
              <div className="relative h-20 w-24 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                {imageUrl ? (
                  <>
                    <img src={imageUrl} alt="Dish preview" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black transition"
                      title="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center text-slate-400 text-[10px]">
                    <ImageIcon className="h-6 w-6 text-slate-300 mb-0.5" />
                    <span>No Image</span>
                  </div>
                )}
              </div>

              {/* Upload & URL Inputs */}
              <div className="flex-1 space-y-2 w-full">
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        processImageFile(file, (dataUrl) => setImageUrl(dataUrl));
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                  >
                    <Upload className="h-3.5 w-3.5 text-amber-600" />
                    <span>Upload Image from Device</span>
                  </button>
                  <span className="text-xs text-slate-400">or paste URL:</span>
                </div>

                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/... or uploaded photo link"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="pt-2 border-t border-slate-100">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Or Quick Choose Sample Food Photo:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setImageUrl(preset.url)}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900 transition"
                  >
                    🍱 {preset.label}
                  </button>
                ))}
              </div>
            </div>
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
              className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition shadow-2xs"
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
              ? 'bg-amber-600 text-white shadow-2xs'
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
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Items Grid with Dish Images */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">Loading master menu...</div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
          No dishes added in this category yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`rounded-2xl border overflow-hidden transition bg-white shadow-xs flex flex-col justify-between ${
                item.is_available ? 'border-slate-200 hover:shadow-md' : 'border-slate-200 bg-slate-50/70 opacity-60'
              }`}
            >
              <div>
                {/* Dish Photo Header with Change Photo Action */}
                <div className="relative h-36 w-full bg-slate-100 overflow-hidden group">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="h-full w-full flex flex-col items-center justify-center text-slate-300 bg-gradient-to-br from-slate-50 to-slate-100">
                      <Utensils className="h-8 w-8 mb-1" />
                      <span className="text-[11px] font-medium text-slate-400">No Photo Uploaded</span>
                    </div>
                  )}

                  {/* Veg / Non-veg Badge on Photo */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-white/95 backdrop-blur-xs px-2 py-0.5 text-[10px] font-bold text-slate-800 shadow-2xs">
                    <span
                      className={`h-2 w-2 rounded-full ${item.is_veg ? 'bg-emerald-600' : 'bg-red-600'}`}
                    />
                    <span>{item.is_veg ? 'Veg' : 'Non-Veg'}</span>
                  </div>

                  {/* Price Tag on Photo */}
                  <div className="absolute top-2.5 right-2.5 rounded-full bg-emerald-900/90 text-white px-2.5 py-0.5 text-xs font-extrabold shadow-2xs">
                    {formatPaiseToINR(item.price_paise)}
                  </div>

                  {/* Upload / Change Photo Hover Overlay Button */}
                  <button
                    type="button"
                    onClick={() => openPhotoModal(item)}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-white text-xs font-bold transition backdrop-blur-2xs cursor-pointer"
                  >
                    <Camera className="h-4 w-4" />
                    <span>Upload / Change Photo</span>
                  </button>
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{item.name}</h4>
                      <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block mt-0.5">
                        {item.category.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {item.description && (
                    <p className="mt-2 text-xs text-slate-500 line-clamp-2 leading-relaxed">{item.description}</p>
                  )}
                </div>
              </div>

              {/* Bottom Card Controls */}
              <div className="p-4 pt-0">
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
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

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openPhotoModal(item)}
                      className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-slate-100 transition"
                      title="Upload or change dish photo"
                    >
                      <Camera className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 transition"
                      title="Remove dish"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Dish Photo Modal */}
      {editingPhotoItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-4">
            <button
              onClick={() => setEditingPhotoItem(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm border-b border-slate-100 pb-2">
              <Camera className="h-4 w-4 text-amber-600" />
              <span>Update Dish Image: {editingPhotoItem.name}</span>
            </div>

            {/* Preview */}
            <div className="relative h-44 w-full rounded-xl border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center">
              {editingPhotoUrl ? (
                <img src={editingPhotoUrl} alt="Dish photo preview" className="h-full w-full object-cover" />
              ) : (
                <div className="text-center text-slate-400 text-xs">
                  <ImageIcon className="h-8 w-8 mx-auto text-slate-300 mb-1" />
                  <span>No photo selected</span>
                </div>
              )}
            </div>

            {/* File Upload Button */}
            <div className="space-y-2">
              <input
                ref={modalFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    processImageFile(file, (dataUrl) => setEditingPhotoUrl(dataUrl));
                  }
                }}
              />
              <button
                type="button"
                onClick={() => modalFileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-amber-400 bg-amber-50/60 py-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition shadow-2xs"
              >
                <Upload className="h-4 w-4 text-amber-600" />
                <span>Upload New Photo from Device</span>
              </button>

              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-slate-400">or URL:</span>
                <input
                  type="url"
                  value={editingPhotoUrl}
                  onChange={(e) => setEditingPhotoUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/... or image link"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              {/* Sample Presets */}
              <div className="pt-2">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Choose from Curated Photos:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setEditingPhotoUrl(p.url)}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:border-amber-400 hover:bg-amber-50 transition"
                    >
                      🍱 {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setEditingPhotoItem(null)}
                disabled={savingPhoto}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePhotoModal}
                disabled={savingPhoto}
                className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 shadow-2xs disabled:opacity-50 transition"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{savingPhoto ? 'Saving...' : 'Save Image'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
