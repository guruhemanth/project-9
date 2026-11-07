-- Migration 08: Dynamic Commission Rate per Caterer
ALTER TABLE caterer_svc.caterers 
ADD COLUMN IF NOT EXISTS commission_pct numeric(4,2) NOT NULL DEFAULT 15.00;
