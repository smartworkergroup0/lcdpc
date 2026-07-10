-- Create measurement_unit_classifications table
CREATE TABLE measurement_unit_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE
);

CREATE INDEX idx_measurement_unit_classifications_code ON measurement_unit_classifications(code);

-- Seed initial classifications
INSERT INTO measurement_unit_classifications (id, name, code) VALUES
    (gen_random_uuid(), 'Peso', 'weight'),
    (gen_random_uuid(), 'Volumen', 'volume'),
    (gen_random_uuid(), 'Longitud', 'length'),
    (gen_random_uuid(), 'Unidad', 'unit'),
    (gen_random_uuid(), 'Empaque', 'packaging');

-- Add classification_id to measurement_units
ALTER TABLE measurement_units ADD COLUMN classification_id UUID REFERENCES measurement_unit_classifications(id) ON DELETE SET NULL;
CREATE INDEX idx_measurement_units_classification ON measurement_units(classification_id);

-- Update existing units with their classifications
UPDATE measurement_units SET classification_id = (SELECT id FROM measurement_unit_classifications WHERE code = 'weight') WHERE code IN ('kg', 'g');
UPDATE measurement_units SET classification_id = (SELECT id FROM measurement_unit_classifications WHERE code = 'volume') WHERE code IN ('l', 'ml', 'gallon');
UPDATE measurement_units SET classification_id = (SELECT id FROM measurement_unit_classifications WHERE code = 'length') WHERE code IN ('m', 'cm');
UPDATE measurement_units SET classification_id = (SELECT id FROM measurement_unit_classifications WHERE code = 'unit') WHERE code IN ('unit', 'piece');
UPDATE measurement_units SET classification_id = (SELECT id FROM measurement_unit_classifications WHERE code = 'packaging') WHERE code IN ('box', 'sack', 'pack');
