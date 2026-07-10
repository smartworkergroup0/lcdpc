-- Remove image fields from products and bundles

ALTER TABLE products DROP COLUMN img;
ALTER TABLE bundles DROP COLUMN img;
