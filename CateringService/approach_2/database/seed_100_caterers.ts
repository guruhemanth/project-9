import pg from 'pg';
import crypto from 'crypto';

// Password hash for 'Password123!' (bcrypt cost 10)
const DEFAULT_PASSWORD_HASH = '$2b$10$fahpwQ2OvqBT0Wo.mHvI9.ZwzWCClnkkXRXNZI0ibk9UhGP2096N2';

interface CityData {
  city: string;
  state: string;
  pincode: string;
  areas: string[];
}

const CITIES: CityData[] = [
  { city: 'Tirupati', state: 'Andhra Pradesh', pincode: '517501', areas: ['Alipiri', 'MR Palli', 'Bhavani Nagar', 'Chandragiri', 'Renigunta', 'Air Bypass Road'] },
  { city: 'Hyderabad', state: 'Telangana', pincode: '500001', areas: ['Banjara Hills', 'Jubilee Hills', 'Gachibowli', 'Madhapur', 'Secunderabad', 'Kukatpally'] },
  { city: 'Bengaluru', state: 'Karnataka', pincode: '560001', areas: ['Indiranagar', 'Koramangala', 'Jayanagar', 'Whitefield', 'Malleshwaram', 'HSR Layout'] },
  { city: 'Chennai', state: 'Tamil Nadu', pincode: '600001', areas: ['Mylapore', 'T. Nagar', 'Adyar', 'Anna Nagar', 'Velachery', 'Besant Nagar'] },
  { city: 'Vijayawada', state: 'Andhra Pradesh', pincode: '520001', areas: ['Benz Circle', 'Governorpet', 'Moghalrajpuram', 'Bhavanipuram', 'Gannavaram'] },
  { city: 'Visakhapatnam', state: 'Andhra Pradesh', pincode: '530001', areas: ['MVP Colony', 'Gajuwaka', 'Siripuram', 'Dwaraka Nagar', 'Rushikonda'] },
  { city: 'Mumbai', state: 'Maharashtra', pincode: '400001', areas: ['Bandra West', 'Andheri East', 'Dadar', 'Juhu', 'Colaba', 'Powai'] },
  { city: 'Pune', state: 'Maharashtra', pincode: '411001', areas: ['Kothrud', 'Koregaon Park', 'Viman Nagar', 'Aundh', 'Baner', 'Shivajinagar'] },
  { city: 'Delhi NCR', state: 'Delhi', pincode: '110001', areas: ['Connaught Place', 'South Extension', 'Dwarka', 'Noida Sector 18', 'Gurugram CyberHub'] },
  { city: 'Kolkata', state: 'West Bengal', pincode: '700001', areas: ['Salt Lake', 'Park Street', 'Ballygunge', 'New Town', 'Alipore'] },
  { city: 'Jaipur', state: 'Rajasthan', pincode: '302001', areas: ['Malviya Nagar', 'Vaishali Nagar', 'C-Scheme', 'Mansarovar', 'Tonk Road'] },
  { city: 'Ahmedabad', state: 'Gujarat', pincode: '380001', areas: ['Navrangpura', 'Bodakdev', 'Satellite', 'Vastrapur', 'Maninagar'] },
  { city: 'Kochi', state: 'Kerala', pincode: '682001', areas: ['Fort Kochi', 'Edappally', 'Kakkanad', 'Marine Drive', 'Panampilly Nagar'] },
  { city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641001', areas: ['RS Puram', 'Gandhipuram', 'Peelamedu', 'Saibaba Colony', 'Race Course'] },
  { city: 'Madurai', state: 'Tamil Nadu', pincode: '625001', areas: ['KK Nagar', 'Anna Nagar', 'Simmakkal', 'Tallakulam', 'Mattuthavani'] },
  { city: 'Mysuru', state: 'Karnataka', pincode: '570001', areas: ['Gokulam', 'Jayalakshmipuram', 'Kuvempunagar', 'Saraswathipuram', 'Vijayanagar'] },
  { city: 'Lucknow', state: 'Uttar Pradesh', pincode: '226001', areas: ['Hazratganj', 'Gomti Nagar', 'Aliganj', 'Indira Nagar', 'Mahanagar'] },
  { city: 'Chandigarh', state: 'Punjab', pincode: '160001', areas: ['Sector 17', 'Sector 35', 'Sector 22', 'Sector 8', 'Panchkula'] },
  { city: 'Indore', state: 'Madhya Pradesh', pincode: '452001', areas: ['Vijay Nagar', 'Palasia', 'Chappan Dukan', 'Rajwada', 'Bhawarkua'] },
  { city: 'Bhubaneswar', state: 'Odisha', pincode: '751001', areas: ['Saheed Nagar', 'Nayapalli', 'Jayadev Vihar', 'Patia', 'Khandagiri'] },
];

const BRAND_PREFIXES = [
  'Sri', 'Shree', 'Royal', 'Grand', 'Classic', 'Heritage', 'Golden', 'Authentic', 'Imperial', 'Divine',
  'Crown', 'Saffron', 'Annapurna', 'Maharaja', 'Ananda', 'Utsav', 'Paramount', 'Signature', 'Vedic', 'Elite'
];

const BRAND_SPECIALTIES = [
  'Banquets & Caterers', 'Wedding Feasts', 'Catering Services', 'Gourmet Kitchen', 'Traditional Caterers',
  'Grand Event Caterers', 'Brahmin Bhojanams', 'Culinary Creations', 'Royal Dastarkhwan', 'Feast Masters'
];

const CUISINE_POOLS = [
  ['andhra', 'south_indian', 'traditional_meals'],
  ['south_indian', 'chettinad', 'traditional_meals'],
  ['north_indian', 'mughlai', 'punjabi'],
  ['hyderabadi', 'mughlai', 'andhra'],
  ['gujarati', 'rajasthani', 'traditional_meals'],
  ['traditional_meals', 'south_indian', 'andhra'],
  ['north_indian', 'continental', 'chinese'],
  ['andhra', 'chettinad', 'south_indian'],
  ['punjabi', 'north_indian', 'traditional_meals'],
  ['south_indian', 'traditional_meals', 'hyderabadi'],
];

const DISH_CATALOG = {
  welcome_drink: [
    { name: 'Nannari Sharbat', price: 4000, isVeg: true, desc: 'Traditional cooling herbal root sherbet' },
    { name: 'Masala Majjiga (Spiced Buttermilk)', price: 3000, isVeg: true, desc: 'Fresh churned curd with ginger, green chilli, and curry leaves' },
    { name: 'Tender Coconut Punch', price: 5000, isVeg: true, desc: 'Fresh elaneer with mint and lime splash' },
    { name: 'Paan Gulkand Thandai', price: 6000, isVeg: true, desc: 'Rich dry-fruit infused royal cooling thandai' },
    { name: 'Aam Panna', price: 4500, isVeg: true, desc: 'Roasted green mango cooler with roasted cumin' },
  ],
  starter: [
    { name: 'Guntur Mirchi Bajji', price: 7000, isVeg: true, desc: 'Crispy fried Andhra chilies stuffed with spiced onions' },
    { name: 'Paneer Malai Tikka', price: 11000, isVeg: true, desc: 'Charcoal grilled cottage cheese marinated in rich cream and cardamom' },
    { name: 'Kaju Corn Pakoda', price: 8500, isVeg: true, desc: 'Golden fried sweet corn kernels tossed with whole roasted cashews' },
    { name: 'Medu Vada with Coconut Chutney', price: 6500, isVeg: true, desc: 'Crunchy golden urad lentil fritters' },
    { name: 'Chicken 65 (Authentic Spicy)', price: 13500, isVeg: false, desc: 'Crispy curry-leaf tempered spicy boneless chicken cubes' },
    { name: 'Mutton Seekh Kebab', price: 18500, isVeg: false, desc: 'Finely minced spiced mutton skewers smoked over coal embers' },
    { name: 'Hara Bhara Kebab', price: 7500, isVeg: true, desc: 'Nutritious spinach and green pea patties stuffed with spiced nuts' },
    { name: 'Crispy Veg Spring Rolls', price: 8000, isVeg: true, desc: 'Handcrafted rolls stuffed with wok-tossed oriental vegetables' },
  ],
  main: [
    { name: 'Paneer Butter Masala', price: 14000, isVeg: true, desc: 'Rich and creamy tomato makhani gravy with soft paneer chunks' },
    { name: 'Gutti Vankaya Kura', price: 12500, isVeg: true, desc: 'Stuffed baby brinjal cooked in traditional sesame-peanut-coconut gravy' },
    { name: 'Mamidikaya Pappu (Mango Dal)', price: 9000, isVeg: true, desc: 'Tangy raw mango cooked with yellow lentils and ghee tadka' },
    { name: 'Dal Makhani', price: 11500, isVeg: true, desc: 'Slow simmered black lentils overnight with white butter and cream' },
    { name: 'Dum Ka Murgh (Hyderabadi Style)', price: 19000, isVeg: false, desc: 'Slow-cooked marinated chicken in rich almond and brown onion sauce' },
    { name: 'Nellore Chepala Pulusu', price: 21000, isVeg: false, desc: 'Traditional earthen pot fish curry with tangy tamarind and methi seeds' },
    { name: 'Gongura Mutton Curry', price: 24000, isVeg: false, desc: 'Tender mutton pieces simmered with sour roselle leaves' },
    { name: 'Vegetable Kurma', price: 11000, isVeg: true, desc: 'Assorted seasonal vegetables simmered in spiced coconut gravy' },
  ],
  bread_rice: [
    { name: 'Steamed Sona Masoori Rice', price: 5000, isVeg: true, desc: 'Fresh fragrant premium steamed rice' },
    { name: 'Butter Tandoori Roti', price: 3500, isVeg: true, desc: 'Clay oven roasted whole wheat flatbread brushed with butter' },
    { name: 'Garlic Butter Naan', price: 5000, isVeg: true, desc: 'Tandoor baked leavened bread infused with fresh garlic butter' },
    { name: 'Hyderabadi Veg Dum Biryani', price: 16000, isVeg: true, desc: 'Aromatic long-grain basmati rice layered with marinated vegetables and saffron' },
    { name: 'Hyderabadi Chicken Dum Biryani', price: 22000, isVeg: false, desc: 'Authentic kacchi dum biryani cooked in sealed handi with tender chicken' },
    { name: 'Traditional Sambar & Rasam', price: 6000, isVeg: true, desc: 'Drumstick sambar and pepper rasam served with papad' },
    { name: 'Bagara Rice', price: 9000, isVeg: true, desc: 'Fragrant Telangana style spiced tempered rice' },
  ],
  dessert: [
    { name: 'Tirupati Style Kaju Laddu', price: 9000, isVeg: true, desc: 'Traditional rich besan laddu with pure desi ghee and crunchy cashews' },
    { name: 'Gulab Jamun with Rabdi', price: 7500, isVeg: true, desc: 'Warm melt-in-mouth milk solids soaked in saffron syrup with chilled rabdi' },
    { name: 'Pootharekulu (Paper Sweet)', price: 9500, isVeg: true, desc: 'Delicate Atreyapuram rice starch sheets layered with jaggery and ghee' },
    { name: 'Shahi Tukda', price: 8000, isVeg: true, desc: 'Crispy fried bread soaked in saffron syrup topped with thick pistachio rabri' },
    { name: 'Elaneer Payasam', price: 8500, isVeg: true, desc: 'Heavenly pudding made of tender coconut pulp and condensed milk' },
  ],
  beverage: [
    { name: 'Filter Coffee', price: 3500, isVeg: true, desc: 'Strong South Indian chicory-brewed decoction filter coffee' },
    { name: 'Ginger Cardamom Masala Chai', price: 3000, isVeg: true, desc: 'Aromatic milk tea brewed with fresh ginger and crushed green cardamoms' },
  ]
};

export async function seed100Caterers(connectionString: string) {
  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log(`\n===========================================================`);
  console.log(`🚀 SEEDING 100 REALISTIC CATERING SERVICES & MENUS 🚀`);
  console.log(`===========================================================`);

  try {
    await client.query('BEGIN');

    let totalCaterers = 0;
    let totalPackages = 0;
    let totalItems = 0;

    for (let i = 1; i <= 100; i++) {
      const cityObj = CITIES[(i - 1) % CITIES.length];
      const prefix = BRAND_PREFIXES[(i - 1) % BRAND_PREFIXES.length];
      const specialty = BRAND_SPECIALTIES[(i * 3) % BRAND_SPECIALTIES.length];
      const businessName = `${prefix} ${specialty} (${cityObj.city})`;

      const userId = `10000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
      const catererId = `20000000-0000-0000-0000-${String(i).padStart(12, '0')}`;

      const emailSlug = `${prefix.toLowerCase()}.${cityObj.city.toLowerCase().replace(/[^a-z0-9]/g, '')}.${i}`;
      const email = `${emailSlug}@caterconnect.demo`;
      const ownerName = `Chef ${prefix} Narayana`;
      const phone = `+9198${String(10000000 + i).slice(-8)}`;

      // 1. Insert Owner User
      await client.query(`
        INSERT INTO auth_svc.users (id, email, password_hash, role, full_name, phone)
        VALUES ($1, $2, $3, 'caterer', $4, $5)
        ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone;
      `, [userId, email, DEFAULT_PASSWORD_HASH, ownerName, phone]);

      // 2. Select Cuisines & Service areas
      const cuisines = CUISINE_POOLS[(i - 1) % CUISINE_POOLS.length];
      const serviceAreas = cityObj.areas.slice(0, 4);
      const fssaiNumber = `101230${String(10000000 + i)}`;
      const stateCode = cityObj.state === 'Andhra Pradesh' ? '37' : cityObj.state === 'Karnataka' ? '29' : cityObj.state === 'Tamil Nadu' ? '33' : cityObj.state === 'Telangana' ? '36' : '27';
      const gstNumber = `${stateCode}AAAAA${String(1000 + i)}A1Z5`;
      const avgRating = (4.3 + ((i * 7) % 65) / 100).toFixed(2);
      const reviewCount = 15 + ((i * 13) % 150);
      const minGuests = i % 3 === 0 ? 30 : i % 3 === 1 ? 50 : 25;
      const maxGuests = 1000 + (i % 5) * 500;

      // Insert Caterer Profile
      await client.query(`
        INSERT INTO caterer_svc.caterers (
          id, owner_id, business_name, description, city, state, pincode, address,
          service_areas, cuisines, fssai_number, gst_number, status, avg_rating,
          review_count, min_guests, max_guests, lead_time_days, allows_custom_combo, commission_pct
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, 'approved', $13,
          $14, $15, $16, 2, true, 15.00
        )
        ON CONFLICT (id) DO UPDATE SET
          business_name = EXCLUDED.business_name,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          min_guests = EXCLUDED.min_guests,
          max_guests = EXCLUDED.max_guests,
          status = 'approved';
      `, [
        catererId, userId, businessName,
        `Premium authentic event catering in ${cityObj.city}. Renowned for master chef recipes, impeccable hygienic live counters, and hospitable banana leaf service.`,
        cityObj.city, cityObj.state, cityObj.pincode, `${cityObj.areas[0]} Main Road, ${cityObj.city}`,
        serviceAreas, cuisines, fssaiNumber, gstNumber, avgRating,
        reviewCount, minGuests, maxGuests
      ]);

      totalCaterers++;

      // 3. Insert 2 Pre-set Packages per Caterer
      const pkg1Id = `30000000-0000-0000-0000-${String(i * 2 - 1).padStart(12, '0')}`;
      const pkg2Id = `30000000-0000-0000-0000-${String(i * 2).padStart(12, '0')}`;

      const pkg1Price = (320 + ((i * 5) % 80)) * 100; // in paise (e.g. ₹320 - ₹395)
      const pkg2Price = (550 + ((i * 11) % 150)) * 100; // in paise (e.g. ₹550 - ₹690)

      await client.query(`
        INSERT INTO caterer_svc.packages (
          id, caterer_id, name, description, price_per_plate_paise, min_guests, max_guests, is_veg, is_active, is_customizable
        ) VALUES
        ($1, $2, $3, $4, $5, $6, $7, true, true, true),
        ($8, $2, $9, $10, $11, $12, $13, false, true, true)
        ON CONFLICT (id) DO UPDATE SET price_per_plate_paise = EXCLUDED.price_per_plate_paise;
      `, [
        pkg1Id, catererId, `${prefix} Traditional Bhojanam`, `Authentic 14-course meal prepared with pure ghee and fresh local produce.`, pkg1Price, minGuests, maxGuests,
        pkg2Id, `${prefix} Royal Grand Banquet`, `Extensive multi-cuisine feast including welcome drinks, live tandoor starters, dum biryani, and artisanal sweets.`, pkg2Price, minGuests + 25, maxGuests
      ]);

      totalPackages += 2;

      // Insert Package Items for Package 1
      await client.query(`
        INSERT INTO caterer_svc.package_items (package_id, name, category) VALUES
        ($1, 'Welcome Herbal Sharbat', 'beverage'),
        ($1, 'Guntur Mirchi Bajji', 'starter'),
        ($1, 'Paneer Butter Masala', 'main'),
        ($1, 'Mamidikaya Pappu & Steamed Rice', 'main'),
        ($1, 'Tirupati Kaju Laddu', 'dessert')
        ON CONFLICT DO NOTHING;
      `, [pkg1Id]);

      // Insert Package Items for Package 2
      await client.query(`
        INSERT INTO caterer_svc.package_items (package_id, name, category) VALUES
        ($1, 'Paan Gulkand Thandai', 'beverage'),
        ($1, 'Paneer Malai Tikka & Chicken 65', 'starter'),
        ($1, 'Hyderabadi Dum Biryani with Mirchi Ka Salan', 'main'),
        ($1, 'Dal Makhani & Butter Naan', 'main'),
        ($1, 'Gulab Jamun with Chilled Rabdi', 'dessert')
        ON CONFLICT DO NOTHING;
      `, [pkg2Id]);

      // 4. Insert 8 Master Kitchen Dishes into caterer_svc.menu_items
      const dishesToInsert = [
        DISH_CATALOG.welcome_drink[i % DISH_CATALOG.welcome_drink.length],
        DISH_CATALOG.starter[(i * 2) % DISH_CATALOG.starter.length],
        DISH_CATALOG.starter[(i * 2 + 1) % DISH_CATALOG.starter.length],
        DISH_CATALOG.main[(i * 3) % DISH_CATALOG.main.length],
        DISH_CATALOG.main[(i * 3 + 1) % DISH_CATALOG.main.length],
        DISH_CATALOG.bread_rice[(i * 2) % DISH_CATALOG.bread_rice.length],
        DISH_CATALOG.dessert[i % DISH_CATALOG.dessert.length],
        DISH_CATALOG.beverage[i % DISH_CATALOG.beverage.length],
      ];

      for (let dIdx = 0; dIdx < dishesToInsert.length; dIdx++) {
        const dish = dishesToInsert[dIdx];
        const menuItemId = `40000000-0000-0000-0000-${String(i * 100 + dIdx).padStart(12, '0')}`;
        const cat = dIdx === 0 ? 'welcome_drink' : dIdx < 3 ? 'starter' : dIdx < 5 ? 'main' : dIdx === 5 ? 'bread_rice' : dIdx === 6 ? 'dessert' : 'beverage';

        await client.query(`
          INSERT INTO caterer_svc.menu_items (
            id, caterer_id, name, category, price_paise, is_veg, description, is_available
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
          ON CONFLICT (id) DO UPDATE SET price_paise = EXCLUDED.price_paise;
        `, [menuItemId, catererId, dish.name, cat, dish.price, dish.isVeg, dish.desc]);

        totalItems++;
      }
    }

    await client.query('COMMIT');

    console.log(`✓ Successfully seeded:`);
    console.log(`  - ${totalCaterers} Approved Catering Services across 20 Indian cities`);
    console.log(`  - ${totalPackages} Curated Packages`);
    console.log(`  - ${totalItems} Master Kitchen Dishes`);
    console.log(`  - 100 Caterer Owner User accounts (Password: Password123!)`);
    console.log(`===========================================================\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err);
    throw err;
  } finally {
    await client.end();
  }
}

// Direct execution from CLI
const targetDb = process.argv[2] || process.env.CATER_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:Guru%40123@127.0.0.1:5432/caterconnect';
seed100Caterers(targetDb).catch(() => process.exit(1));
