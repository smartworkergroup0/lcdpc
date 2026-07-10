-- Restore base_measure_type, units_per_box, units_per_bundle
ALTER TABLE products ADD COLUMN base_measure_type VARCHAR(20) NOT NULL DEFAULT 'Unidad';
ALTER TABLE products ADD COLUMN units_per_box INTEGER;
ALTER TABLE products ADD COLUMN units_per_bundle INTEGER;
