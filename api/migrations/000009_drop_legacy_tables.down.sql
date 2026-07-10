-- Recreate legacy tables for rollback compatibility

-- User Role Assignments
CREATE TABLE user_role_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    sede_ids UUID[] NOT NULL DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_role_assignments_user_role_active ON user_role_assignments (user_id, role_id, active);

-- API Resources
CREATE TABLE api_resources (
    id UUID PRIMARY KEY,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(120) NOT NULL,
    endpoint VARCHAR(240) NOT NULL,
    method VARCHAR(10) NOT NULL,
    description VARCHAR(300) NOT NULL
);
CREATE UNIQUE INDEX idx_api_resources_code ON api_resources (code);
CREATE UNIQUE INDEX idx_api_resources_endpoint_method ON api_resources (endpoint, method);

INSERT INTO api_resources (id, code, name, endpoint, method, description) VALUES
    ('44444444-4444-4444-4444-444444444441', 'auth.register.start', 'Iniciar registro de cliente', '/api/v1/auth/register/start', 'POST', 'Endpoint para iniciar flujo de registro y emitir OTP'),
    ('44444444-4444-4444-4444-444444444442', 'health.api.get', 'Health API Controller', '/api/health', 'GET', 'Health endpoint del controlador API'),
    ('44444444-4444-4444-4444-444444444443', 'health.probe.get', 'Health probe', '/health', 'GET', 'Health check de infraestructura');

-- Role Resource Permissions
CREATE TABLE role_resource_permissions (
    id UUID PRIMARY KEY,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES api_resources(id) ON DELETE CASCADE,
    can_view BOOLEAN NOT NULL DEFAULT false,
    can_write BOOLEAN NOT NULL DEFAULT false,
    can_update BOOLEAN NOT NULL DEFAULT false,
    can_delete BOOLEAN NOT NULL DEFAULT false,
    can_all BOOLEAN NOT NULL DEFAULT false,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_role_resource_permissions_role_resource ON role_resource_permissions (role_id, resource_id);

INSERT INTO role_resource_permissions (id, role_id, resource_id, can_view, can_write, can_update, can_delete, can_all, created_at_utc) VALUES
    ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444441', false, true, false, false, false, '2026-05-16 00:00:00+00'),
    ('55555555-5555-5555-5555-555555555552', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444441', false, true, false, false, false, '2026-05-16 00:00:00+00'),
    ('55555555-5555-5555-5555-555555555553', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444441', false, true, false, false, false, '2026-05-16 00:00:00+00'),
    ('55555555-5555-5555-5555-555555555554', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444442', true, false, false, false, false, '2026-05-16 00:00:00+00'),
    ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444442', true, false, false, false, false, '2026-05-16 00:00:00+00'),
    ('55555555-5555-5555-5555-555555555556', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444442', true, false, false, false, false, '2026-05-16 00:00:00+00'),
    ('55555555-5555-5555-5555-555555555557', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444443', true, false, false, false, false, '2026-05-16 00:00:00+00'),
    ('55555555-5555-5555-5555-555555555558', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444443', true, false, false, false, false, '2026-05-16 00:00:00+00'),
    ('55555555-5555-5555-5555-555555555559', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444443', true, false, false, false, false, '2026-05-16 00:00:00+00');
