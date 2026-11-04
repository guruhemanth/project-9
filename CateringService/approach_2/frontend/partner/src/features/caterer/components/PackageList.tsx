import React from 'react';
import { Plus, Eye, EyeOff, Utensils, Check } from 'lucide-react';
import { formatPaiseToINR } from '@/lib/formatters';
import type { Package, PackageItem } from '@/types/database';

interface Props {
  packages: (Package & { items: PackageItem[] })[];
  onAddPackageClick: () => void;
  onToggleActive: (packageId: string) => void;
}

export const PackageList: React.FC<Props> = ({ packages, onAddPackageClick, onToggleActive }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Menu Packages ({packages.length})</h2>
          <p className="text-xs text-slate-500">Packages visible to customers when your business is approved</p>
        </div>
        <button
          onClick={onAddPackageClick}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
        >
          <Plus className="h-4 w-4" />
          <span>New Package</span>
        </button>
      </div>

      {packages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center bg-white">
          <Utensils className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-700">No packages created yet</p>
          <p className="text-xs text-slate-500">Add per-plate wedding or party packages for customers.</p>
          <button
            onClick={onAddPackageClick}
            className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Create First Package
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className={`rounded-xl border p-4 bg-white flex flex-col justify-between transition ${
                pkg.is_active ? 'border-slate-200 shadow-xs' : 'border-slate-200 bg-slate-50/70 opacity-75'
              }`}
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
                    <h3 className="text-sm font-bold text-slate-900">{pkg.name}</h3>
                  </div>
                  <span className="text-sm font-extrabold text-slate-900">
                    {formatPaiseToINR(pkg.price_per_plate)} <span className="text-[10px] font-normal text-slate-500">/ plate</span>
                  </span>
                </div>

                {pkg.description && (
                  <p className="mt-1 text-xs text-slate-600 line-clamp-2">{pkg.description}</p>
                )}

                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                  <span>Min: <b>{pkg.min_guests}</b> guests</span>
                  {pkg.max_guests && <span>• Max: <b>{pkg.max_guests}</b></span>}
                </div>

                {pkg.items && pkg.items.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <span className="text-[11px] font-semibold uppercase text-slate-500 block mb-1">
                      Includes ({pkg.items.length} items):
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {pkg.items.map((item, i) => (
                        <span key={i} className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700">
                          {item.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span
                  className={`inline-flex items-center gap-1 font-semibold ${
                    pkg.is_active ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                  {pkg.is_active ? 'Active on menu' : 'Hidden'}
                </span>
                <button
                  type="button"
                  onClick={() => onToggleActive(pkg.id)}
                  className="flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium"
                >
                  {pkg.is_active ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" /> Hide
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" /> Activate
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
