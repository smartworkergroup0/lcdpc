-- Prices: restore branch_id
ALTER TABLE product_branch_prices ADD COLUMN branch_id UUID;
UPDATE product_branch_prices pbp SET branch_id = (
    SELECT branch_id FROM products WHERE product_id = pbp.product_id
);
ALTER TABLE product_branch_prices ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE product_branch_prices ADD CONSTRAINT product_branch_prices_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS idx_product_branch_prices_lookup;
CREATE INDEX idx_product_branch_prices_lookup ON product_branch_prices (product_id, branch_id, valid_from);

-- Bundles: restore enabled_branch_ids[]
ALTER TABLE bundles ADD COLUMN enabled_branch_ids UUID[] NOT NULL DEFAULT '{}';
UPDATE bundles SET enabled_branch_ids = ARRAY[branch_id] WHERE branch_id IS NOT NULL;
ALTER TABLE bundles DROP COLUMN branch_id;

-- Products: remove branch_id
DROP INDEX IF EXISTS idx_products_branch_id;
ALTER TABLE products DROP COLUMN branch_id;
