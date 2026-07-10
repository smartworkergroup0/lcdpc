-- Remove classification_id from measurement_units
DROP INDEX IF EXISTS idx_measurement_units_classification;
ALTER TABLE measurement_units DROP COLUMN classification_id;

-- Drop table
DROP INDEX IF EXISTS idx_measurement_unit_classifications_code;
DROP TABLE measurement_unit_classifications;
