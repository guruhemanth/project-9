import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Pool } from 'pg';

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath, override: true });

const dbUrl = process.env.CATER_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:Guru%40123@127.0.0.1:5432/caterconnect';
const pgPool = new Pool({ connectionString: dbUrl });

function resolveSmartDishImage(name: string, category: string, providedUrl?: string | null): string {
  if (providedUrl && providedUrl.trim().length > 0) {
    return providedUrl.trim();
  }

  const n = name.toLowerCase();

  // Starters
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
  if (n.includes('hara bhara')) {
    return 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80';
  }

  // Mains
  if (n.includes('paneer') && (category === 'main' || n.includes('masala') || n.includes('butter'))) {
    return 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('dal') || n.includes('pappu') || n.includes('sambar') || n.includes('rasam')) {
    return 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('vankaya') || n.includes('kurma') || n.includes('kofta') || n.includes('curry')) {
    return 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('chicken') || n.includes('murgh')) {
    return 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('mutton') || n.includes('gongura') || n.includes('lamb')) {
    return 'https://images.unsplash.com/photo-1545247181-516773cae754?auto=format&fit=crop&w=600&q=80';
  }

  // Breads & Rice
  if (n.includes('chicken') && n.includes('biryani')) {
    return 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('biryani') || n.includes('pulao') || n.includes('bagara') || n.includes('fried rice')) {
    return 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('naan') || n.includes('roti') || n.includes('paratha') || n.includes('kulcha')) {
    return 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('rice') || n.includes('pongal')) {
    return 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80';
  }

  // Desserts
  if (n.includes('jamun')) {
    return 'https://images.unsplash.com/photo-1589301773859-bb0d43a6aa9b?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('laddu') || n.includes('kaju') || n.includes('sweet') || n.includes('barfi')) {
    return 'https://images.unsplash.com/photo-1605197143984-6992d9d6d1b7?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('payasam') || n.includes('kheer')) {
    return 'https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('halwa') || n.includes('tukda')) {
    return 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80';
  }

  // Drinks
  if (n.includes('majjiga') || n.includes('buttermilk') || n.includes('lassi')) {
    return 'https://images.unsplash.com/photo-1556881286-fc6915169721?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('sharbat') || n.includes('panna') || n.includes('thandai') || n.includes('juice')) {
    return 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('coffee') || n.includes('chai') || n.includes('tea')) {
    return 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80';
  }
  if (n.includes('coconut')) {
    return 'https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=600&q=80';
  }

  const categoryFallbacks: Record<string, string> = {
    starter: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80',
    main: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
    bread_rice: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
    dessert: 'https://images.unsplash.com/photo-1589301773859-bb0d43a6aa9b?auto=format&fit=crop&w=600&q=80',
    welcome_drink: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
    beverage: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80',
    accompaniment: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
  };

  return categoryFallbacks[category] || 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80';
}

// Simple robust CSV line parser handling quotes
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

export async function bulkImportDishes(options: {
  filePath: string;
  catererId?: string;
  catererName?: string;
  all?: boolean;
}) {
  const { filePath, catererId, catererName, all } = options;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const rawContent = fs.readFileSync(filePath, 'utf-8');
  const lines = rawContent.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    throw new Error('CSV file must have a header row and at least 1 data row');
  }

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/[\s_-]+/g, ''));
  const rows: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length === 0 || cols.every((c) => c === '')) continue;

    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = cols[idx] || '';
    });

    const dishName = rowObj['dishname'] || rowObj['name'] || rowObj['dish'] || '';
    if (!dishName) continue;

    const category = rowObj['category'] || 'main';
    const priceStr = rowObj['pricerupees'] || rowObj['price'] || rowObj['pricepaise'] || '50';
    let pricePaise = Math.round(parseFloat(priceStr) * 100);
    if (pricePaise > 100000) {
      // already in paise
      pricePaise = Math.round(parseFloat(priceStr));
    }

    const isVegStr = (rowObj['isveg'] || rowObj['veg'] || 'true').toLowerCase();
    const isVeg = !(isVegStr === 'non-veg' || isVegStr === 'nonveg' || isVegStr === 'false' || isVegStr === 'no' || isVegStr === '0');
    const description = rowObj['description'] || rowObj['desc'] || null;
    const imageUrl = rowObj['imageurl'] || rowObj['image'] || rowObj['photo'] || null;

    rows.push({
      dishName,
      category,
      pricePaise,
      isVeg,
      description,
      imageUrl,
    });
  }

  console.log(`Parsed ${rows.length} valid dish rows from ${filePath}`);

  // Determine target caterers
  let targetCatererIds: { id: string; business_name: string }[] = [];

  if (catererId) {
    const res = await pgPool.query('SELECT id, business_name FROM caterer_svc.caterers WHERE id = $1', [catererId]);
    if (res.rows.length === 0) throw new Error(`Caterer with ID ${catererId} not found`);
    targetCatererIds = res.rows;
  } else if (catererName) {
    const res = await pgPool.query('SELECT id, business_name FROM caterer_svc.caterers WHERE business_name ILIKE $1', [`%${catererName}%`]);
    if (res.rows.length === 0) throw new Error(`No caterers found matching name '${catererName}'`);
    targetCatererIds = res.rows;
  } else if (all) {
    const res = await pgPool.query('SELECT id, business_name FROM caterer_svc.caterers WHERE status = $1', ['approved']);
    targetCatererIds = res.rows;
  } else {
    throw new Error('Must specify --catererId, --catererName, or --all');
  }

  console.log(`Targeting ${targetCatererIds.length} caterer(s)...`);

  let totalInserted = 0;
  let totalUpdated = 0;

  for (const cat of targetCatererIds) {
    console.log(`Processing dishes for: ${cat.business_name} (${cat.id})`);

    for (const r of rows) {
      const cleanName = r.dishName.trim();
      const cleanCat = (r.category || 'main').toLowerCase().trim();
      const resolvedImg = resolveSmartDishImage(cleanName, cleanCat, r.imageUrl);

      const exist = await pgPool.query(
        `SELECT id, image_url FROM caterer_svc.menu_items
         WHERE caterer_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))
         LIMIT 1`,
        [cat.id, cleanName]
      );

      if (exist.rows.length > 0) {
        const existingId = exist.rows[0].id;
        const finalImg = r.imageUrl ? resolvedImg : (exist.rows[0].image_url || resolvedImg);

        await pgPool.query(
          `UPDATE caterer_svc.menu_items
           SET category = $1, price_paise = $2, is_veg = $3, description = COALESCE($4, description),
               image_url = $5, updated_at = NOW()
           WHERE id = $6`,
          [cleanCat, r.pricePaise, r.isVeg, r.description, finalImg, existingId]
        );
        totalUpdated++;
      } else {
        await pgPool.query(
          `INSERT INTO caterer_svc.menu_items
           (caterer_id, name, category, price_paise, is_veg, description, image_url, is_available)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
          [cat.id, cleanName, cleanCat, r.pricePaise, r.isVeg, r.description, resolvedImg]
        );
        totalInserted++;
      }
    }
  }

  console.log(`\n🎉 Bulk Import Finished! Total Inserted: ${totalInserted}, Total Updated: ${totalUpdated}`);
  await pgPool.end();
}

// Allow direct CLI invocation
if (require.main === module) {
  const args = process.argv.slice(2);
  let filePath = '';
  let catererId: string | undefined;
  let catererName: string | undefined;
  let all = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' || args[i] === '-f') filePath = args[++i];
    else if (args[i] === '--catererId' || args[i] === '-c') catererId = args[++i];
    else if (args[i] === '--catererName' || args[i] === '-n') catererName = args[++i];
    else if (args[i] === '--all') all = true;
  }

  if (!filePath) {
    console.error('Usage: npx tsx scripts/bulk_import_caterer_menus.ts --file <path.csv> [--catererId <UUID> | --catererName <string> | --all]');
    process.exit(1);
  }

  bulkImportDishes({ filePath, catererId, catererName, all })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error during bulk import:', err);
      process.exit(1);
    });
}
