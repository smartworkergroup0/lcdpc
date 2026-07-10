-- Remove stock fields from bundles
ALTER TABLE bundles DROP COLUMN stock;
ALTER TABLE bundles DROP COLUMN stock_available;
ALTER TABLE bundles DROP COLUMN stock_blocked;

-- Remove stock fields from products
ALTER TABLE products DROP COLUMN stock;
ALTER TABLE products DROP COLUMN stock_available;
ALTER TABLE products DROP COLUMN stock_blocked;
