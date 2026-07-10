CREATE TABLE service_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(500) NOT NULL,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    token_expiry_hours INT NOT NULL DEFAULT 12,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at_utc TIMESTAMPTZ
);

CREATE INDEX idx_service_accounts_username ON service_accounts(username) WHERE deleted_at_utc IS NULL;
CREATE INDEX idx_service_accounts_deleted_at ON service_accounts(deleted_at_utc) WHERE deleted_at_utc IS NULL;

-- RBAC permissions for service account CRUD
INSERT INTO resources (id, code) VALUES
    (gen_random_uuid(), 'service_account:view'),
    (gen_random_uuid(), 'service_account:create'),
    (gen_random_uuid(), 'service_account:update'),
    (gen_random_uuid(), 'service_account:delete')
ON CONFLICT (code) DO NOTHING;

-- Assign CRUD permissions to global_admin
INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code LIKE 'service_account:%'
ON CONFLICT (role_id, resource_id) DO NOTHING;

-- Create "cuenta_servicio" role
INSERT INTO roles (id, code, name, description) VALUES
    ('66666666-6666-6666-6666-666666666666', 'cuenta_servicio', 'cuenta_servicio',
     'Service account role with read-only access to products and bundles')
ON CONFLICT (code) DO NOTHING;

-- Assign product:view and bundle:view to cuenta_servicio role
INSERT INTO role_resources (role_id, resource_id)
SELECT '66666666-6666-6666-6666-666666666666', id FROM resources
WHERE code IN ('product:view', 'bundle:view')
ON CONFLICT (role_id, resource_id) DO NOTHING;

-- Create "cuenta_servicio" profile
INSERT INTO profiles (id, name, code, created_at_utc, updated_at_utc) VALUES
    ('77777777-7777-7777-7777-777777777777', 'Cuenta de Servicio', 'cuenta_servicio',
     now(), now())
ON CONFLICT (code) DO NOTHING;

-- Assign cuenta_servicio role to cuenta_servicio profile
INSERT INTO profile_role_assignments (id, profile_id, role_id, active, created_at_utc)
VALUES (
    gen_random_uuid(),
    '77777777-7777-7777-7777-777777777777',
    '66666666-6666-6666-6666-666666666666',
    true, now()
) ON CONFLICT (profile_id, role_id) DO NOTHING;
