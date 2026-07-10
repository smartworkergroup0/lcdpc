-- Categories table
CREATE TABLE categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_categories_slug ON categories (slug);

-- FK en products
ALTER TABLE products ADD COLUMN category_id UUID REFERENCES categories(category_id) ON DELETE SET NULL;
CREATE INDEX idx_products_category_id ON products (category_id);

-- FK en bundles
ALTER TABLE bundles ADD COLUMN category_id UUID REFERENCES categories(category_id) ON DELETE SET NULL;
CREATE INDEX idx_bundles_category_id ON bundles (category_id);

-- Seed RBAC resources for category permissions
INSERT INTO resources (id, code) VALUES
    (gen_random_uuid(), 'category:create'),
    (gen_random_uuid(), 'category:update'),
    (gen_random_uuid(), 'category:delete')
ON CONFLICT (code) DO NOTHING;

-- Assign category resources to global_admin role
INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code IN ('category:create', 'category:update', 'category:delete')
ON CONFLICT (role_id, resource_id) DO NOTHING;
