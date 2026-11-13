-- Migration 12: Dish, Package Item, and Package Image URLs
ALTER TABLE caterer_svc.menu_items
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE caterer_svc.package_items
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE caterer_svc.packages
  ADD COLUMN IF NOT EXISTS image_url text;
