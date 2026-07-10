-- Add brand_id to products (NOT NULL with default)
-- First add as nullable
ALTER TABLE products ADD COLUMN brand_id UUID REFERENCES brands(id) ON DELETE SET NULL;
CREATE INDEX idx_products_brand_id ON products(brand_id);

-- Seed a default brand for existing products
INSERT INTO brands (id, name, code) VALUES
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Sin marca', 'no-brand')
ON CONFLICT (code) DO NOTHING;

-- Set default brand on existing products
UPDATE products SET brand_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE brand_id IS NULL;

-- Now make it NOT NULL
ALTER TABLE products ALTER COLUMN brand_id SET NOT NULL;
