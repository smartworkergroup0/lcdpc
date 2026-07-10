-- Remove FK from products and bundles
DROP INDEX IF EXISTS idx_bundles_measurement_unit;
ALTER TABLE bundles DROP COLUMN measurement_unit_id;

DROP INDEX IF EXISTS idx_products_measurement_unit;
ALTER TABLE products DROP COLUMN measurement_unit_id;

-- Drop table
DROP INDEX IF EXISTS idx_measurement_units_code;
DROP TABLE measurement_units;
