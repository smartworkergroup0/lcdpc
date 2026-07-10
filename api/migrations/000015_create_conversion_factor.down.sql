-- Restore measurement_unit_id to products and bundles
ALTER TABLE products ADD COLUMN measurement_unit_id UUID REFERENCES measurement_units(id) ON DELETE SET NULL;
CREATE INDEX idx_products_measurement_unit ON products(measurement_unit_id);

ALTER TABLE bundles ADD COLUMN measurement_unit_id UUID REFERENCES measurement_units(id) ON DELETE SET NULL;
CREATE INDEX idx_bundles_measurement_unit ON bundles(measurement_unit_id);

-- Remove base_unit_id from products
DROP INDEX IF EXISTS idx_products_base_unit;
ALTER TABLE products DROP COLUMN base_unit_id;

-- Drop conversion_factor table
DROP INDEX IF EXISTS idx_conversion_factors_main;
DROP INDEX IF EXISTS idx_conversion_factors_to_unit;
DROP INDEX IF EXISTS idx_conversion_factors_from_unit;
DROP INDEX IF EXISTS idx_conversion_factors_product;
DROP TABLE conversion_factors;

-- Remove Pieza and Galon
DELETE FROM measurement_units WHERE code IN ('piece', 'gallon');
