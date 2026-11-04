-- 02_seed_data.sql: Initial Seed Data for Tirupati CaterConnect

-- Seed Users in auth_svc
-- Passwords hashed with bcrypt (cost 10) for 'Password123!'
-- Hash: $2b$10$fahpwQ2OvqBT0Wo.mHvI9.ZwzWCClnkkXRXNZI0ibk9UhGP2096N2
INSERT INTO auth_svc.users (id, email, password_hash, role, full_name, phone)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'customer@example.com', '$2b$10$fahpwQ2OvqBT0Wo.mHvI9.ZwzWCClnkkXRXNZI0ibk9UhGP2096N2', 'customer', 'Ramesh Kumar', '+919876543210'),
  ('c0000000-0000-0000-0000-000000000002', 'caterer@example.com', '$2b$10$fahpwQ2OvqBT0Wo.mHvI9.ZwzWCClnkkXRXNZI0ibk9UhGP2096N2', 'caterer', 'Srinivasa Rao', '+919876543211'),
  ('c0000000-0000-0000-0000-000000000003', 'admin@caterconnect.in', '$2b$10$fahpwQ2OvqBT0Wo.mHvI9.ZwzWCClnkkXRXNZI0ibk9UhGP2096N2', 'admin', 'CaterConnect Admin', '+919876543212')
ON CONFLICT (id) DO NOTHING;

-- Seed Caterer in caterer_svc
INSERT INTO caterer_svc.caterers (
  id,
  owner_id,
  business_name,
  description,
  city,
  service_areas,
  cuisines,
  fssai_number,
  gst_number,
  status,
  avg_rating,
  review_count
) VALUES (
  'd0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000002',
  'Sri Venkateswara Catering Services',
  'Authentic Andhra & South Indian traditional wedding and event feasts in Tirupati.',
  'Tirupati',
  ARRAY['Alipiri', 'MR Palli', 'Bhavani Nagar', 'Chandragiri', 'Renigunta'],
  ARRAY['andhra', 'south_indian', 'traditional_meals'],
  '10123000004567',
  '37AAAAA0000A1Z5',
  'approved',
  4.80,
  12
) ON CONFLICT (id) DO NOTHING;

-- Seed Packages in caterer_svc
INSERT INTO caterer_svc.packages (
  id,
  caterer_id,
  name,
  description,
  price_per_plate_paise,
  min_guests,
  max_guests,
  is_veg,
  is_active
) VALUES (
  'e0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'Grand Tirupati Wedding Feast',
  'Full traditional 18-course meal served on fresh plantain leaf with Tirupati Laddu sweet.',
  35000,
  50,
  1000,
  true,
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO caterer_svc.package_items (package_id, name, category)
VALUES
  ('e0000000-0000-0000-0000-000000000001', 'Poori & Potato Masala', 'starter'),
  ('e0000000-0000-0000-0000-000000000001', 'Gutti Vankaya Curry', 'main'),
  ('e0000000-0000-0000-0000-000000000001', 'Andhra Tomato Pappu with Ghee', 'main'),
  ('e0000000-0000-0000-0000-000000000001', 'Authentic Sambar & Rasam', 'main'),
  ('e0000000-0000-0000-0000-000000000001', 'Tirupati Style Besan Laddu', 'dessert'),
  ('e0000000-0000-0000-0000-000000000001', 'Masala Buttermilk', 'beverage')
ON CONFLICT (id) DO NOTHING;
