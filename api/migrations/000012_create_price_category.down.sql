-- Remove price_category_id from product_branch_prices
DROP INDEX IF EXISTS idx_product_branch_prices_category;
ALTER TABLE product_branch_prices DROP COLUMN price_category_id;

-- Drop price_categories table
DROP INDEX IF EXISTS idx_price_categories_code;
DROP TABLE price_categories;
