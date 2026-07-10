-- Products: add branch_id
ALTER TABLE products ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX idx_products_branch_id ON products(branch_id);

-- Bundles: replace enabled_branch_ids[] with branch_id
ALTER TABLE bundles ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
UPDATE bundles SET branch_id = enabled_branch_ids[1] WHERE array_length(enabled_branch_ids, 1) >= 1;
ALTER TABLE bundles DROP COLUMN enabled_branch_ids;

-- Prices: remove branch_id
ALTER TABLE product_branch_prices DROP CONSTRAINT product_branch_prices_branch_id_fkey;
ALTER TABLE product_branch_prices DROP COLUMN branch_id;
DROP INDEX IF EXISTS idx_product_branch_prices_lookup;
CREATE INDEX idx_product_branch_prices_lookup ON product_branch_prices (product_id, valid_from);
