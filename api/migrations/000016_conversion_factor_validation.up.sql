-- Prevent exact duplicates: same product + same from_unit + same to_unit
CREATE UNIQUE INDEX idx_conversion_factors_no_duplicate 
    ON conversion_factors(product_id, from_unit_id, to_unit_id);

-- Prevent from_unit = to_unit
ALTER TABLE conversion_factors 
    ADD CONSTRAINT chk_conversion_different_units 
    CHECK (from_unit_id != to_unit_id);
