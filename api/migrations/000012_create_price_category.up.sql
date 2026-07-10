-- Create price_category table
CREATE TABLE price_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE
);

CREATE INDEX idx_price_categories_code ON price_categories(code);

-- Seed initial categories
INSERT INTO price_categories (id, name, code) VALUES
    (gen_random_uuid(), 'Minorista', 'retail'),
    (gen_random_uuid(), 'Mayorista', 'wholesale'),
    (gen_random_uuid(), 'Oferta', 'offer');

-- Add price_category_id to product_branch_prices
ALTER TABLE product_branch_prices ADD COLUMN price_category_id UUID REFERENCES price_categories(id) ON DELETE SET NULL;
CREATE INDEX idx_product_branch_prices_category ON product_branch_prices(price_category_id);
