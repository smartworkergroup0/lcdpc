-- Create brands table
CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_brands_code ON brands(code);

-- Seed RBAC resources for brand
INSERT INTO resources (id, code) VALUES
    (gen_random_uuid(), 'brand:create'),
    (gen_random_uuid(), 'brand:view'),
    (gen_random_uuid(), 'brand:update'),
    (gen_random_uuid(), 'brand:delete')
ON CONFLICT (code) DO NOTHING;

-- Assign brand resources to global_admin role
INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code IN ('brand:create', 'brand:view', 'brand:update', 'brand:delete')
ON CONFLICT (role_id, resource_id) DO NOTHING;
