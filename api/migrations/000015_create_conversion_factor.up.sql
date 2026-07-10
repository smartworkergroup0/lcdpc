-- Create conversion_factor table
CREATE TABLE conversion_factors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    from_unit_id UUID NOT NULL REFERENCES measurement_units(id) ON DELETE RESTRICT,
    to_unit_id UUID NOT NULL REFERENCES measurement_units(id) ON DELETE RESTRICT,
    amount DECIMAL(12,4) NOT NULL CHECK (amount > 0),
    main BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_conversion_factors_product ON conversion_factors(product_id);
CREATE INDEX idx_conversion_factors_from_unit ON conversion_factors(from_unit_id);
CREATE INDEX idx_conversion_factors_to_unit ON conversion_factors(to_unit_id);
CREATE UNIQUE INDEX idx_conversion_factors_main ON conversion_factors(product_id) WHERE main = true;

-- Add base_unit_id to products (replaces measurement_unit_id)
ALTER TABLE products ADD COLUMN base_unit_id UUID REFERENCES measurement_units(id) ON DELETE SET NULL;
CREATE INDEX idx_products_base_unit ON products(base_unit_id);

-- Remove measurement_unit_id from products and bundles
DROP INDEX IF EXISTS idx_products_measurement_unit;
ALTER TABLE products DROP COLUMN measurement_unit_id;

DROP INDEX IF EXISTS idx_bundles_measurement_unit;
ALTER TABLE bundles DROP COLUMN measurement_unit_id;
