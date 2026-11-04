-- 20261103000001_seed_data.sql
-- Seed data for CaterConnect (Tirupati Caterers & Initial Records)

-- 1. Mock Auth Users & Profiles (Customer, Caterer, Admin)
-- Insert into auth.users first to satisfy foreign key constraint
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  role,
  aud
) VALUES
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'customer@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'caterer@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'admin@caterconnect.in', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, phone)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'customer', 'Ramesh Kumar', '+919876543210'),
  ('c0000000-0000-0000-0000-000000000002', 'caterer', 'Srinivasa Rao', '+919876543211'),
  ('c0000000-0000-0000-0000-000000000003', 'admin', 'CaterConnect Admin', '+919876543212')
ON CONFLICT (id) DO UPDATE
SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, role = EXCLUDED.role;

-- 2. Caterers in Tirupati
-- Caterer 1: Sri Venkateswara Catering Services (Approved)
INSERT INTO public.caterers (
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

-- 3. Packages for Sri Venkateswara Catering
-- Package 1: Traditional Andhra Banana Leaf Meal (paise: 35000 = Rs 350/plate)
INSERT INTO public.packages (
  id,
  caterer_id,
  name,
  description,
  price_per_plate,
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

-- 4. Package Items
INSERT INTO public.package_items (package_id, name, category)
VALUES
  ('e0000000-0000-0000-0000-000000000001', 'Poori & Potato Masala', 'starter'),
  ('e0000000-0000-0000-0000-000000000001', 'Gutti Vankaya Curry', 'main'),
  ('e0000000-0000-0000-0000-000000000001', 'Andhra Tomato Pappu with Ghee', 'main'),
  ('e0000000-0000-0000-0000-000000000001', 'Authentic Sambar & Rasam', 'main'),
  ('e0000000-0000-0000-0000-000000000001', 'Tirupati Style Besan Laddu', 'dessert'),
  ('e0000000-0000-0000-0000-000000000001', 'Masala Buttermilk', 'beverage')
ON CONFLICT (id) DO NOTHING;

-- 5. Addons
INSERT INTO public.addons (id, caterer_id, name, price, pricing_unit)
VALUES
  ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Live Dosa Counter', 5000, 'per_plate'),
  ('f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'Mineral Water Dispenser Units', 300000, 'flat')
ON CONFLICT (id) DO NOTHING;
