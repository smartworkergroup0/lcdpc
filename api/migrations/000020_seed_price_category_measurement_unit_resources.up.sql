-- Seed RBAC resources for price_category
INSERT INTO resources (id, code) VALUES
    (gen_random_uuid(), 'price_category:create'),
    (gen_random_uuid(), 'price_category:view'),
    (gen_random_uuid(), 'price_category:update'),
    (gen_random_uuid(), 'price_category:delete')
ON CONFLICT (code) DO NOTHING;

-- Seed RBAC resources for measurement_unit
INSERT INTO resources (id, code) VALUES
    (gen_random_uuid(), 'measurement_unit:create'),
    (gen_random_uuid(), 'measurement_unit:view'),
    (gen_random_uuid(), 'measurement_unit:update'),
    (gen_random_uuid(), 'measurement_unit:delete')
ON CONFLICT (code) DO NOTHING;

-- Seed missing category:view resource
INSERT INTO resources (id, code) VALUES
    (gen_random_uuid(), 'category:view')
ON CONFLICT (code) DO NOTHING;

-- Assign all new resources to global_admin role
INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code IN (
    'price_category:create', 'price_category:view', 'price_category:update', 'price_category:delete',
    'measurement_unit:create', 'measurement_unit:view', 'measurement_unit:update', 'measurement_unit:delete',
    'category:view'
)
ON CONFLICT (role_id, resource_id) DO NOTHING;
