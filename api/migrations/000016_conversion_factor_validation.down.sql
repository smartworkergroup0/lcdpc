ALTER TABLE conversion_factors DROP CONSTRAINT IF EXISTS chk_conversion_different_units;
DROP INDEX IF EXISTS idx_conversion_factors_no_duplicate;
