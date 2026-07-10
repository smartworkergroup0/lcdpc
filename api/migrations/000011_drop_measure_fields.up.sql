-- Remove base_measure_type, units_per_box, units_per_bundle from products
ALTER TABLE products DROP COLUMN base_measure_type;
ALTER TABLE products DROP COLUMN units_per_box;
ALTER TABLE products DROP COLUMN units_per_bundle;
