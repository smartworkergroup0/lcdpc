-- RBAC: resources, role_resources, profile_role_assignments

-- resources: simple code-based permissions
CREATE TABLE resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL UNIQUE
);

-- role_resources: join table (no CRUD flags)
CREATE TABLE role_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(role_id, resource_id)
);

-- profile_role_assignments: profile → role
CREATE TABLE profile_role_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(profile_id, role_id)
);
CREATE INDEX idx_profile_role_assignments_profile_active ON profile_role_assignments (profile_id, active);

-- Seed resources
INSERT INTO resources (id, code) VALUES
    ('66666666-0000-0000-0000-000000000001', 'product:create'),
    ('66666666-0000-0000-0000-000000000002', 'product:view'),
    ('66666666-0000-0000-0000-000000000003', 'product:update'),
    ('66666666-0000-0000-0000-000000000004', 'product:delete'),
    ('66666666-0000-0000-0000-000000000005', 'combo:create'),
    ('66666666-0000-0000-0000-000000000006', 'combo:view'),
    ('66666666-0000-0000-0000-000000000007', 'combo:update'),
    ('66666666-0000-0000-0000-000000000008', 'combo:delete'),
    ('66666666-0000-0000-0000-000000000009', 'combo:publish'),
    ('66666666-0000-0000-0000-000000000010', 'combo:pause'),
    ('66666666-0000-0000-0000-000000000011', 'price:create'),
    ('66666666-0000-0000-0000-000000000012', 'price:view'),
    ('66666666-0000-0000-0000-000000000013', 'price:update'),
    ('66666666-0000-0000-0000-000000000014', 'price:delete'),
    ('66666666-0000-0000-0000-000000000015', 'sede:create'),
    ('66666666-0000-0000-0000-000000000016', 'sede:view'),
    ('66666666-0000-0000-0000-000000000017', 'security-policy:view'),
    ('66666666-0000-0000-0000-000000000018', 'security-policy:update'),
    ('66666666-0000-0000-0000-000000000019', 'rbac:resource:create'),
    ('66666666-0000-0000-0000-000000000020', 'rbac:resource:view'),
    ('66666666-0000-0000-0000-000000000021', 'rbac:resource:update'),
    ('66666666-0000-0000-0000-000000000022', 'rbac:resource:delete'),
    ('66666666-0000-0000-0000-000000000023', 'rbac:role:create'),
    ('66666666-0000-0000-0000-000000000024', 'rbac:role:view'),
    ('66666666-0000-0000-0000-000000000025', 'rbac:role:update'),
    ('66666666-0000-0000-0000-000000000026', 'rbac:role:delete'),
    ('66666666-0000-0000-0000-000000000027', 'rbac:profile:create'),
    ('66666666-0000-0000-0000-000000000028', 'rbac:profile:view'),
    ('66666666-0000-0000-0000-000000000029', 'rbac:profile:update'),
    ('66666666-0000-0000-0000-000000000030', 'rbac:profile:delete'),
    ('66666666-0000-0000-0000-000000000031', 'rbac:user:update')
ON CONFLICT (id) DO NOTHING;

-- Seed role_resources: admin_global gets ALL resources
INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
ON CONFLICT (role_id, resource_id) DO NOTHING;

-- Seed role_resources: admin_sede gets product/combo/price/sede CRUD (no rbac, no security-policy)
INSERT INTO role_resources (role_id, resource_id)
SELECT '22222222-2222-2222-2222-222222222222', id FROM resources
WHERE code IN (
    'product:create', 'product:view', 'product:update', 'product:delete',
    'combo:create', 'combo:view', 'combo:update', 'combo:delete', 'combo:publish', 'combo:pause',
    'price:create', 'price:view', 'price:update', 'price:delete',
    'sede:create', 'sede:view'
)
ON CONFLICT (role_id, resource_id) DO NOTHING;

-- Seed role_resources: cliente gets view-only
INSERT INTO role_resources (role_id, resource_id)
SELECT '11111111-1111-1111-1111-111111111111', id FROM resources
WHERE code IN ('product:view', 'combo:view', 'price:view', 'sede:view')
ON CONFLICT (role_id, resource_id) DO NOTHING;

-- Migrate user_role_assignments → profile_role_assignments
INSERT INTO profile_role_assignments (profile_id, role_id, active, created_at_utc)
SELECT p.id, ura.role_id, ura.active, ura.created_at_utc
FROM user_role_assignments ura
JOIN profiles p ON p.user_id = ura.user_id
ON CONFLICT (profile_id, role_id) DO NOTHING;
