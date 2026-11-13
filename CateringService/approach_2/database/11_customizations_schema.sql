-- Migration 11: Dynamic Customizations, Menu Items Catalog, and Min Guest Configuration

-- 1. Add minimum/maximum guest threshold & custom combo allowance to caterers
ALTER TABLE caterer_svc.caterers
  ADD COLUMN IF NOT EXISTS min_guests integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS max_guests integer DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS lead_time_days integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS allows_custom_combo boolean NOT NULL DEFAULT true;

-- 2. Standalone Menu Items table for Caterers
CREATE TABLE IF NOT EXISTS caterer_svc.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caterer_id uuid NOT NULL REFERENCES caterer_svc.caterers(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('welcome_drink', 'starter', 'main', 'bread_rice', 'dessert', 'beverage', 'accompaniment')),
  price_paise integer NOT NULL DEFAULT 0 CHECK (price_paise >= 0),
  is_veg boolean NOT NULL DEFAULT true,
  description text,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_caterer ON caterer_svc.menu_items(caterer_id);

-- 3. Package customization rules and link to menu items
ALTER TABLE caterer_svc.packages
  ADD COLUMN IF NOT EXISTS is_customizable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_rules jsonb DEFAULT '{}'::jsonb;

-- Mapping between pre-set packages and individual menu_items (optional link for item substitutions)
CREATE TABLE IF NOT EXISTS caterer_svc.package_menu_items (
  package_id uuid NOT NULL REFERENCES caterer_svc.packages(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES caterer_svc.menu_items(id) ON DELETE CASCADE,
  is_mandatory boolean NOT NULL DEFAULT false,
  PRIMARY KEY (package_id, menu_item_id)
);

-- 4. Store custom item selections in Bookings & make package_id nullable for custom feast combos
ALTER TABLE order_svc.bookings
  ALTER COLUMN package_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS customized_items jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_combo_name text;

-- 5. Ensure chat_threads has updated_at column
ALTER TABLE chat_svc.chat_threads
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
