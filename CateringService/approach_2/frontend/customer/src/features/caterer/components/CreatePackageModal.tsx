import React, { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { rupeesToPaise } from '@/lib/formatters';
import type { Package, PackageItem } from '@/types/database';

interface Props {
  catererId: string;
  onClose: () => void;
  onCreated: (pkg: Package & { items: PackageItem[] }) => void;
}

export const CreatePackageModal: React.FC<Props> = ({ catererId, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceRupees, setPriceRupees] = useState<number>(350);
  const [minGuests, setMinGuests] = useState<number>(50);
  const [maxGuests, setMaxGuests] = useState<number | ''>(500);
  const [isVeg, setIsVeg] = useState(true);

  // Items
  const [items, setItems] = useState<{ name: string; category: 'starter' | 'main' | 'dessert' | 'beverage' }[]>([
    { name: 'Welcome Drink', category: 'beverage' },
    { name: 'Paneer Tikka', category: 'starter' },
    { name: 'Tomato Pappu with Ghee', category: 'main' },
    { name: 'Gulab Jamun', category: 'dessert' },
  ]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<'starter' | 'main' | 'dessert' | 'beverage'>('starter');

  const addItem = () => {
    if (newItemName.trim()) {
      setItems([...items, { name: newItemName.trim(), category: newItemCategory }]);
      setNewItemName('');
    }
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const createdPkg: Package & { items: PackageItem[] } = {
      id: 'e' + Math.floor(100000000000 + Math.random() * 900000000000),
      caterer_id: catererId,
      name,
      description: description || null,
      price_per_plate: rupeesToPaise(Number(priceRupees)),
      min_guests: Number(minGuests),
      max_guests: maxGuests ? Number(maxGuests) : null,
      is_veg: isVeg,
      is_active: true,
      created_at: new Date().toISOString(),
      items: items.map((item, idx) => ({
        id: 'item-' + idx + '-' + Date.now(),
        package_id: 'e-pkg',
        name: item.name,
        category: item.category,
      })),
    };

    onCreated(createdPkg);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-bold text-slate-900">Create Catering Menu Package</h2>
        <p className="text-xs text-slate-500 mt-0.5">Define your per-plate package and include courses</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">Package Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Royal Andhra Wedding Thali"
              className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Traditional buffet with authentic South Indian flavors..."
              className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">Price (₹ Per Plate)</label>
              <input
                type="number"
                required
                min={50}
                value={priceRupees}
                onChange={(e) => setPriceRupees(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm focus:border-emerald-500 focus:outline-none font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">Meal Preference</label>
              <select
                value={isVeg ? 'veg' : 'non-veg'}
                onChange={(e) => setIsVeg(e.target.value === 'veg')}
                className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="veg">Pure Vegetarian (Veg)</option>
                <option value="non-veg">Non-Vegetarian Included</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">Min Guests</label>
              <input
                type="number"
                required
                min={10}
                value={minGuests}
                onChange={(e) => setMinGuests(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">Max Guests (Optional)</label>
              <input
                type="number"
                value={maxGuests}
                onChange={(e) => setMaxGuests(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="No limit"
                className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm"
              />
            </div>
          </div>

          {/* Included Items */}
          <div className="pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold uppercase text-slate-700 mb-2">Package Items / Menu Courses</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Item name (e.g. Sambar)"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 py-1.5 px-3 text-xs"
              />
              <select
                value={newItemCategory}
                onChange={(e) => setNewItemCategory(e.target.value as any)}
                className="rounded-lg border border-slate-300 py-1.5 px-2 text-xs"
              >
                <option value="starter">Starter</option>
                <option value="main">Main</option>
                <option value="dessert">Dessert</option>
                <option value="beverage">Beverage</option>
              </select>
              <button
                type="button"
                onClick={addItem}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Add
              </button>
            </div>

            <div className="mt-3 max-h-36 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 text-xs">
                  <div>
                    <span className="font-semibold text-slate-800">{item.name}</span>
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 capitalize">
                      {item.category}
                    </span>
                  </div>
                  <button type="button" onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Save Package
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
