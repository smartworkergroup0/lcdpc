-- Drop global unique index on products.sku; create branch-scoped unique
DROP INDEX IF EXISTS idx_products_sku;
CREATE UNIQUE INDEX idx_products_sku ON products (sku, branch_id);

-- Drop global unique index on bundles.code; create branch-scoped unique
DROP INDEX IF EXISTS idx_bundles_code;
CREATE UNIQUE INDEX idx_bundles_code ON bundles (code, branch_id);
