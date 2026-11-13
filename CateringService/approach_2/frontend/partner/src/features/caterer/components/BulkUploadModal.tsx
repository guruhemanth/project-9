import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Utensils,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatPaiseToINR } from '@/lib/formatters';
import type { MenuItem, MenuItemCategory } from '@/types/database';

interface BulkUploadModalProps {
  catererId: string;
  existingItems: MenuItem[];
  onClose: () => void;
  onSuccess: (importedCount: number, updatedCount: number) => void;
}

interface ParsedDishRow {
  name: string;
  category: MenuItemCategory;
  pricePaise: number;
  isVeg: boolean;
  description: string;
  imageUrl: string;
  isUpdate: boolean;
  isValid: boolean;
  error?: string;
}

const CATEGORY_NAMES: Record<MenuItemCategory, string> = {
  welcome_drink: 'Welcome Drink',
  starter: 'Starter',
  main: 'Curries & Dal',
  bread_rice: 'Breads & Rice',
  dessert: 'Dessert',
  beverage: 'Beverage',
  accompaniment: 'Accompaniment',
};

// Fallback image resolver matching the backend
function resolveSmartDishImage(name: string, category: string, providedUrl?: string): string {
  if (providedUrl && providedUrl.trim().length > 0) {
    return providedUrl.trim();
  }
  const n = name.toLowerCase();
  if (n.includes('paneer') && (n.includes('tikka') || n.includes('kebab') || category === 'starter')) {
    return 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('bajji') || n.includes('pakora') || n.includes('samosa')) {
    return 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('vada')) {
    return 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('chicken 65') || n.includes('kebab') || n.includes('seekh') || n.includes('65')) {
    return 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('paneer')) {
    return 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('dal') || n.includes('pappu') || n.includes('sambar')) {
    return 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('chicken') && n.includes('biryani')) {
    return 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('biryani') || n.includes('pulao') || n.includes('bagara')) {
    return 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('naan') || n.includes('roti') || n.includes('paratha')) {
    return 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('jamun')) {
    return 'https://images.unsplash.com/photo-1589301773859-bb0d43a6aa9b?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('laddu') || n.includes('kaju') || n.includes('sweet')) {
    return 'https://images.unsplash.com/photo-1605197143984-6992d9d6d1b7?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('majjiga') || n.includes('buttermilk')) {
    return 'https://images.unsplash.com/photo-1556881286-fc6915169721?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('coffee') || n.includes('chai')) {
    return 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80';
  }

  const fallbacks: Record<string, string> = {
    starter: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80',
    main: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
    bread_rice: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
    dessert: 'https://images.unsplash.com/photo-1589301773859-bb0d43a6aa9b?auto=format&fit=crop&w=600&q=80',
    welcome_drink: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
    beverage: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80',
    accompaniment: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
  };

  return fallbacks[category] || 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80';
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export const BulkUploadModal: React.FC<BulkUploadModalProps> = ({
  catererId,
  existingItems,
  onClose,
  onSuccess,
}) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedDishRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Existing dish name lookup set for upsert detection
  const existingNames = new Set(existingItems.map((i) => i.name.toLowerCase().trim()));

  const handleDownloadTemplate = () => {
    const csvContent =
`dish_name,category,price_rupees,is_veg,description,image_url
Special Ghee Pongal,starter,80,veg,"Slow-cooked rice and lentils tempered with pure cow ghee and roasted cashews.",https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80
Guntur Mirchi Bajji,starter,65,veg,"Crisp golden fried banana peppers with tangy ajwain stuffing.",https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80
Paneer Malai Tikka,starter,140,veg,"Cottage cheese cubes marinated in hung curd and aromatic spices.",https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80
Andhra Chicken 65,starter,170,non-veg,"Spicy boneless chicken bites tossed with fresh curry leaves and garlic.",https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=600&q=80
Gutti Vankaya Kura,main,130,veg,"Stuffed brinjal curry in roasted peanut and sesame gravy.",https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80
Paneer Butter Masala,main,150,veg,"Tender paneer in rich creamy tomato and butter gravy.",https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80
Mamidikaya Pappu,main,90,veg,"Raw mango dal tempered with mustard seeds and dry red chilies.",https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80
Gongura Mutton Curry,main,230,non-veg,"Tender mutton cooked with sour roselle greens.",https://images.unsplash.com/photo-1545247181-516773cae754?auto=format&fit=crop&w=600&q=80
Hyderabadi Veg Dum Biryani,bread_rice,160,veg,"Fragrant basmati rice layered with vegetables and saffron.",https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80
Butter Garlic Naan,bread_rice,45,veg,"Clay oven baked flatbread brushed with garlic butter.",https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?auto=format&fit=crop&w=600&q=80
Gulab Jamun with Rabdi,dessert,85,veg,"Warm milk dumplings served over chilled reduced saffron milk.",https://images.unsplash.com/photo-1589301773859-bb0d43a6aa9b?auto=format&fit=crop&w=600&q=80
Tirupati Kaju Laddu,dessert,95,veg,"Traditional temple-style rich cashew besan laddus.",https://images.unsplash.com/photo-1605197143984-6992d9d6d1b7?auto=format&fit=crop&w=600&q=80
Spiced Masala Majjiga,welcome_drink,40,veg,"Fresh churned buttermilk tempered with ginger and roasted cumin.",https://images.unsplash.com/photo-1556881286-fc6915169721?auto=format&fit=crop&w=600&q=80
Filter Coffee,beverage,35,veg,"Fresh South Indian chicory blend coffee with frothy whole milk.",https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80
`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'caterconnect_menu_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please upload a valid .csv spreadsheet file');
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

        if (lines.length < 2) {
          setError('CSV file must have a header row and at least 1 dish row.');
          return;
        }

        const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/[\s_-]+/g, ''));
        const rows: ParsedDishRow[] = [];

        for (let i = 1; i < lines.length; i++) {
          const cols = parseCSVLine(lines[i]);
          if (cols.length === 0 || cols.every((c) => c === '')) continue;

          const rowObj: Record<string, string> = {};
          headers.forEach((h, idx) => {
            rowObj[h] = cols[idx] || '';
          });

          const name = rowObj['dishname'] || rowObj['name'] || rowObj['dish'] || '';
          const categoryStr = (rowObj['category'] || 'main').toLowerCase().trim().replace(/[\s-]+/g, '_');
          let category: MenuItemCategory = 'main';

          if (categoryStr in CATEGORY_NAMES) {
            category = categoryStr as MenuItemCategory;
          } else if (categoryStr === 'drinks' || categoryStr === 'drink') {
            category = 'beverage';
          } else if (categoryStr === 'starters') {
            category = 'starter';
          } else if (categoryStr === 'curry' || categoryStr === 'curries' || categoryStr === 'mains') {
            category = 'main';
          } else if (categoryStr === 'rice' || categoryStr === 'bread' || categoryStr === 'breads') {
            category = 'bread_rice';
          } else if (categoryStr === 'sweets' || categoryStr === 'sweet' || categoryStr === 'desserts') {
            category = 'dessert';
          }

          const priceStr = rowObj['pricerupees'] || rowObj['price'] || rowObj['pricepaise'] || '50';
          let parsedPricePaise = Math.round(parseFloat(priceStr) * 100);
          if (parsedPricePaise > 100000) {
            parsedPricePaise = Math.round(parseFloat(priceStr));
          }

          const isVegStr = (rowObj['isveg'] || rowObj['veg'] || 'true').toLowerCase();
          const isVeg = !(
            isVegStr === 'non-veg' ||
            isVegStr === 'nonveg' ||
            isVegStr === 'false' ||
            isVegStr === 'no' ||
            isVegStr === '0'
          );

          const description = rowObj['description'] || rowObj['desc'] || '';
          const rawImageUrl = rowObj['imageurl'] || rowObj['image'] || rowObj['photo'] || '';
          const resolvedImageUrl = resolveSmartDishImage(name, category, rawImageUrl);

          const isUpdate = existingNames.has(name.toLowerCase().trim());
          const isValid = Boolean(name.trim() && !isNaN(parsedPricePaise) && parsedPricePaise >= 0);

          rows.push({
            name: name.trim(),
            category,
            pricePaise: isNaN(parsedPricePaise) ? 5000 : parsedPricePaise,
            isVeg,
            description: description.trim(),
            imageUrl: resolvedImageUrl,
            isUpdate,
            isValid,
            error: !name.trim()
              ? 'Missing dish name'
              : isNaN(parsedPricePaise)
              ? 'Invalid price'
              : undefined,
          });
        }

        if (rows.length === 0) {
          setError('No valid data rows found in the CSV file.');
          return;
        }

        setParsedRows(rows);
      } catch (err: any) {
        setError('Failed to parse CSV file: ' + err.message);
      }
    };

    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setError('No valid dishes to import.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await apiFetch<{
        success: boolean;
        count: number;
        inserted: number;
        updated: number;
      }>(`/api/caterers/${catererId}/items/bulk`, {
        method: 'POST',
        body: JSON.stringify({
          items: validRows.map((r) => ({
            name: r.name,
            category: r.category,
            pricePaise: r.pricePaise,
            isVeg: r.isVeg,
            description: r.description || undefined,
            imageUrl: r.imageUrl || undefined,
          })),
        }),
      });

      if (res.success) {
        onSuccess(res.inserted, res.updated);
        onClose();
      } else {
        throw new Error('Failed to complete bulk upload');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to complete bulk upload');
    } finally {
      setIsSubmitting(false);
    }
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const updateCount = parsedRows.filter((r) => r.isValid && r.isUpdate).length;
  const newCount = validCount - updateCount;
  const errorCount = parsedRows.length - validCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl max-h-[92vh] flex flex-col justify-between">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 disabled:opacity-40 transition"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 text-amber-700 font-bold text-base">
            <FileSpreadsheet className="h-5 w-5 text-amber-600" />
            <span>Bulk Upload Kitchen Dishes (CSV)</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Upload dozens of dishes, prices, categories, and photos at once. Existing dishes will be updated
            automatically without creating duplicates.
          </p>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Top Action Bar: Template Download & File Selector */}
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
            >
              <Download className="h-3.5 w-3.5 text-amber-600" />
              <span>Download Sample CSV Template</span>
            </button>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              (Includes standard courses, prices & photos)
            </span>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition shadow-2xs"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{fileName ? 'Choose Another CSV' : 'Select .CSV File to Import'}</span>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        {parsedRows.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="my-6 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center hover:border-amber-500 hover:bg-amber-50/20 cursor-pointer transition"
          >
            <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 mb-2">
              <Upload className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">Drag & Drop your CSV file here, or click to browse</h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm">
              Columns supported: <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">dish_name</code>,{' '}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">category</code>,{' '}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">price_rupees</code>,{' '}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">is_veg</code>,{' '}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">description</code>,{' '}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">image_url</code>
            </p>
          </div>
        ) : (
          <div className="my-4 flex-1 flex flex-col overflow-hidden space-y-3">
            {/* Stat Summary Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50/80 px-3.5 py-2 rounded-xl border border-amber-200/60 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-amber-950">
                  Preview: {parsedRows.length} rows parsed from <span className="font-mono text-amber-800">{fileName}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-semibold">
                <span className="rounded-md bg-emerald-100 text-emerald-800 px-2 py-0.5 border border-emerald-200">
                  ✨ {newCount} New Dishes
                </span>
                <span className="rounded-md bg-blue-100 text-blue-800 px-2 py-0.5 border border-blue-200">
                  🔄 {updateCount} Updates
                </span>
                {errorCount > 0 && (
                  <span className="rounded-md bg-red-100 text-red-800 px-2 py-0.5 border border-red-200">
                    ⚠️ {errorCount} Invalid
                  </span>
                )}
              </div>
            </div>

            {/* Scrollable Preview Table */}
            <div className="flex-1 overflow-y-auto max-h-[46vh] rounded-xl border border-slate-200 divide-y divide-slate-100">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0 z-10 text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Photo</th>
                    <th className="py-2.5 px-3">Dish Name</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Price</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {parsedRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-50 transition ${
                        !row.isValid ? 'bg-red-50/40' : row.isUpdate ? 'bg-blue-50/20' : ''
                      }`}
                    >
                      {/* Photo Thumbnail */}
                      <td className="py-2 px-3">
                        <div className="h-10 w-10 rounded-md bg-slate-100 overflow-hidden border border-slate-200 shrink-0">
                          {row.imageUrl ? (
                            <img src={row.imageUrl} alt={row.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-slate-300">
                              <Utensils className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Name */}
                      <td className="py-2 px-3 font-semibold text-slate-900 max-w-[180px] truncate">
                        {row.name || <span className="text-red-500 italic">Empty Name</span>}
                      </td>

                      {/* Category */}
                      <td className="py-2 px-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                          {CATEGORY_NAMES[row.category] || row.category}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="py-2 px-3 font-bold text-emerald-800">
                        {formatPaiseToINR(row.pricePaise)}
                      </td>

                      {/* Veg / Non-Veg */}
                      <td className="py-2 px-3">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            row.isVeg
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${row.isVeg ? 'bg-emerald-600' : 'bg-red-600'}`} />
                          <span>{row.isVeg ? 'Veg' : 'Non-Veg'}</span>
                        </span>
                      </td>

                      {/* Description */}
                      <td className="py-2 px-3 text-[11px] text-slate-500 max-w-[220px] truncate">
                        {row.description || <span className="text-slate-300 italic">None</span>}
                      </td>

                      {/* Status */}
                      <td className="py-2 px-3 text-right">
                        {!row.isValid ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600">
                            <AlertCircle className="h-3 w-3" />
                            <span>{row.error}</span>
                          </span>
                        ) : row.isUpdate ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                            <RefreshCw className="h-3 w-3" />
                            <span>Updates</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>New</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Bottom Action Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {parsedRows.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setParsedRows([]);
                  setFileName(null);
                }}
                disabled={isSubmitting}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isSubmitting || validCount === 0}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Importing Dishes...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Confirm & Import ({validCount}) Dishes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
