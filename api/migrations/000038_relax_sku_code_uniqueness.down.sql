-- Restore global unique index on products.sku
DROP INDEX IF EXISTS idx_products_sku;
CREATE UNIQUE INDEX idx_products_sku ON products (sku);

-- Restore global unique index on bundles.code
DROP INDEX IF EXISTS idx_bundles_code;
CREATE UNIQUE INDEX idx_bundles_code ON bundles (code);
