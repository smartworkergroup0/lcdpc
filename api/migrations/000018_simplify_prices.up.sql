-- Simplify product_branch_prices: single amount + currency per category
-- Remove price tiers, valid_from, valid_until

-- Add new columns
ALTER TABLE product_branch_prices ADD COLUMN amount NUMERIC(12, 2);
ALTER TABLE product_branch_prices ADD COLUMN currency VARCHAR(3) DEFAULT 'USD';

-- Migrate data: use price1_unit as the amount
UPDATE product_branch_prices SET amount = price1_unit, currency = price1_currency;

-- Make amount NOT NULL now that data is migrated
ALTER TABLE product_branch_prices ALTER COLUMN amount SET NOT NULL;

-- Drop old price tier columns
ALTER TABLE product_branch_prices DROP COLUMN price1_unit;
ALTER TABLE product_branch_prices DROP COLUMN price1_currency;
ALTER TABLE product_branch_prices DROP COLUMN price2_box_bundle_piece;
ALTER TABLE product_branch_prices DROP COLUMN price2_currency;
ALTER TABLE product_branch_prices DROP COLUMN price3_wholesale_from2;
ALTER TABLE product_branch_prices DROP COLUMN price3_currency;
ALTER TABLE product_branch_prices DROP COLUMN price4_wholesale;
ALTER TABLE product_branch_prices DROP COLUMN price4_currency;
ALTER TABLE product_branch_prices DROP COLUMN price4_requires_agreement;

-- Drop temporal validity columns
ALTER TABLE product_branch_prices DROP COLUMN valid_from;
ALTER TABLE product_branch_prices DROP COLUMN valid_until;

-- Drop old lookup index
DROP INDEX IF EXISTS idx_product_branch_prices_lookup;

-- Unique constraint: one price per category per product
CREATE UNIQUE INDEX idx_product_branch_prices_product_category
  ON product_branch_prices (product_id, price_category_id);
