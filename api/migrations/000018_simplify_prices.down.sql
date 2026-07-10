-- Restore product_branch_prices to multi-tier schema

-- Drop unique constraint
DROP INDEX IF EXISTS idx_product_branch_prices_product_category;

-- Restore old columns
ALTER TABLE product_branch_prices ADD COLUMN price1_unit NUMERIC(12, 2);
ALTER TABLE product_branch_prices ADD COLUMN price1_currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE product_branch_prices ADD COLUMN price2_box_bundle_piece NUMERIC(12, 2);
ALTER TABLE product_branch_prices ADD COLUMN price2_currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE product_branch_prices ADD COLUMN price3_wholesale_from2 NUMERIC(12, 2);
ALTER TABLE product_branch_prices ADD COLUMN price3_currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE product_branch_prices ADD COLUMN price4_wholesale NUMERIC(12, 2);
ALTER TABLE product_branch_prices ADD COLUMN price4_currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE product_branch_prices ADD COLUMN price4_requires_agreement BOOLEAN DEFAULT false;
ALTER TABLE product_branch_prices ADD COLUMN valid_from TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE product_branch_prices ADD COLUMN valid_until TIMESTAMPTZ;

-- Migrate data back
UPDATE product_branch_prices SET price1_unit = amount, price1_currency = currency,
  price2_box_bundle_piece = amount, price2_currency = currency,
  price3_wholesale_from2 = amount, price3_currency = currency;

-- Drop new columns
ALTER TABLE product_branch_prices DROP COLUMN amount;
ALTER TABLE product_branch_prices DROP COLUMN currency;

-- Restore old lookup index
CREATE INDEX idx_product_branch_prices_lookup ON product_branch_prices (product_id, valid_from);
