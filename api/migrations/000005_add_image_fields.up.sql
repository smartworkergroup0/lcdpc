-- Add image fields to products and bundles

ALTER TABLE products ADD COLUMN img VARCHAR(500);
ALTER TABLE bundles ADD COLUMN img VARCHAR(500);
