DROP TABLE IF EXISTS bundle_prices;

ALTER TABLE bundles ADD COLUMN total_price DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE bundles ADD COLUMN total_price_currency VARCHAR(3) NOT NULL DEFAULT 'USD';
ALTER TABLE bundles ADD COLUMN promotional_price DECIMAL(12,2);
ALTER TABLE bundles ADD COLUMN promotional_price_currency VARCHAR(3);

UPDATE bundles SET status = 'Draft' WHERE status = 'Active';
UPDATE bundles SET status = 'Paused' WHERE status = 'Inactive';
ALTER TABLE bundles ALTER COLUMN status SET DEFAULT 'Draft';
