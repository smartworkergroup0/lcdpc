-- Reduce stock precision from DECIMAL(12,4) to DECIMAL(12,3)
-- Products
ALTER TABLE products ALTER COLUMN stock TYPE DECIMAL(12,3);
ALTER TABLE products ALTER COLUMN stock_available TYPE DECIMAL(12,3);
ALTER TABLE products ALTER COLUMN stock_blocked TYPE DECIMAL(12,3);

-- Bundles
ALTER TABLE bundles ALTER COLUMN stock TYPE DECIMAL(12,3);
ALTER TABLE bundles ALTER COLUMN stock_available TYPE DECIMAL(12,3);
ALTER TABLE bundles ALTER COLUMN stock_blocked TYPE DECIMAL(12,3);
