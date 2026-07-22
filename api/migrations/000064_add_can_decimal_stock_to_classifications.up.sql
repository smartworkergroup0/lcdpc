ALTER TABLE measurement_unit_classifications
  ADD COLUMN can_decimal_stock BOOLEAN NOT NULL DEFAULT false;

UPDATE measurement_unit_classifications
SET can_decimal_stock = true
WHERE code IN ('WEIGHT', 'VOLUME', 'LENGTH');
