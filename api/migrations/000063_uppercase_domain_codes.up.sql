-- Convert all domain codes and symbols to UPPERCASE for consistency
-- This migration ensures all code fields follow the UPPERCASE standard

UPDATE categories SET code = UPPER(code);
UPDATE brands SET code = UPPER(code);
UPDATE price_categories SET code = UPPER(code);
UPDATE measurement_units SET code = UPPER(code), symbol = UPPER(symbol);
UPDATE measurement_unit_classifications SET code = UPPER(code);
UPDATE branches SET code = UPPER(code);
UPDATE products SET sku = UPPER(sku);
UPDATE bundles SET code = UPPER(code);