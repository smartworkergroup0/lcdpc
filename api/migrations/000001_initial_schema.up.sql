-- LCDPC Schema - Initial Migration
-- Mirrors the C# EF Core AppDbContext exactly

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(320) NOT NULL,
    password_hash VARCHAR(500) NOT NULL,
    onboarding_status VARCHAR(40) NOT NULL DEFAULT 'pending_verification',
    email_verified_at_utc TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'Active',
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_users_email ON users (email);

-- Profiles
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(120) NOT NULL,
    last_name VARCHAR(120) NOT NULL,
    identity_document VARCHAR(40) NOT NULL,
    rif VARCHAR(40),
    whatsapp_phone VARCHAR(30) NOT NULL,
    full_address VARCHAR(500) NOT NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_profiles_user_id ON profiles (user_id);
CREATE UNIQUE INDEX idx_profiles_identity_document ON profiles (identity_document);
CREATE UNIQUE INDEX idx_profiles_rif ON profiles (rif) WHERE rif IS NOT NULL;

-- Roles
CREATE TABLE roles (
    id UUID PRIMARY KEY,
    code VARCHAR(30) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(300) NOT NULL
);
CREATE UNIQUE INDEX idx_roles_code ON roles (code);

INSERT INTO roles (id, code, name, description) VALUES
    ('11111111-1111-1111-1111-111111111111', 'cliente', 'cliente', 'Rol cliente para operaciones comerciales'),
    ('22222222-2222-2222-2222-222222222222', 'admin_sede', 'admin_sede', 'Administrador con alcance a sedes asignadas'),
    ('33333333-3333-3333-3333-333333333333', 'admin_global', 'admin_global', 'Administrador con alcance global');

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

-- User Sessions (legacy)
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token_hash VARCHAR(128) NOT NULL,
    refresh_token_hash VARCHAR(128) NOT NULL,
    access_token_expires_at_utc TIMESTAMPTZ NOT NULL,
    refresh_token_expires_at_utc TIMESTAMPTZ NOT NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at_utc TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_user_sessions_access_token_hash ON user_sessions (access_token_hash);
CREATE UNIQUE INDEX idx_user_sessions_refresh_token_hash ON user_sessions (refresh_token_hash);
CREATE INDEX idx_user_sessions_user_revoked ON user_sessions (user_id, revoked_at_utc);

-- Sedes
CREATE TABLE sedes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_tienda VARCHAR(160) NOT NULL,
    rif VARCHAR(40) NOT NULL,
    direccion VARCHAR(500) NOT NULL,
    telefono_contacto VARCHAR(30) NOT NULL,
    telefono_contacto_secundario VARCHAR(30),
    horario_atencion VARCHAR(120) NOT NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_sedes_rif ON sedes (rif);
CREATE INDEX idx_sedes_nombre_tienda ON sedes (nombre_tienda);

-- Password Reset Tokens
CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL,
    expires_at_utc TIMESTAMPTZ NOT NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    used_at_utc TIMESTAMPTZ,
    revoked_at_utc TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_password_reset_tokens_token_hash ON password_reset_tokens (token_hash);
CREATE INDEX idx_password_reset_tokens_user_revoked_used ON password_reset_tokens (user_id, revoked_at_utc, used_at_utc);

-- Auth Security Policies
CREATE TABLE auth_security_policies (
    id UUID PRIMARY KEY,
    password_reset_ttl_minutes INTEGER NOT NULL,
    revoke_sessions_on_password_reset BOOLEAN NOT NULL DEFAULT true,
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO auth_security_policies (id, password_reset_ttl_minutes, revoke_sessions_on_password_reset, updated_at_utc) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 30, true, '2026-05-16 00:00:00+00');

-- Audit Logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action_code VARCHAR(120) NOT NULL,
    area VARCHAR(80) NOT NULL,
    metadata_json VARCHAR(4000),
    ip_address VARCHAR(80),
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at_utc);
CREATE INDEX idx_audit_logs_area_action ON audit_logs (area, action_code);

-- Registration Flows
CREATE TABLE registration_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(320) NOT NULL,
    status VARCHAR(80) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    otp_hash VARCHAR(128) NOT NULL,
    verified_at_utc TIMESTAMPTZ,
    otp_expires_at_utc TIMESTAMPTZ NOT NULL,
    otp_attempts INTEGER NOT NULL DEFAULT 0,
    otp_blocked_until_utc TIMESTAMPTZ,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_registration_flows_email ON registration_flows (email);

-- OAuth2 Clients
CREATE TABLE oauth2_clients (
    client_id VARCHAR(100) PRIMARY KEY,
    client_name VARCHAR(200) NOT NULL,
    redirect_uris JSONB NOT NULL,
    grant_types JSONB NOT NULL,
    require_pkce BOOLEAN NOT NULL DEFAULT true,
    allowed_scopes VARCHAR(500) NOT NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- OAuth2 Authorization Codes
CREATE TABLE oauth2_authorization_codes (
    code VARCHAR(128) PRIMARY KEY,
    client_id VARCHAR(100) NOT NULL,
    user_id UUID NOT NULL,
    redirect_uri VARCHAR(500) NOT NULL,
    scope VARCHAR(500) NOT NULL,
    code_challenge VARCHAR(128) NOT NULL,
    code_challenge_method VARCHAR(10) NOT NULL,
    expires_at_utc TIMESTAMPTZ NOT NULL,
    used_at_utc TIMESTAMPTZ,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_oauth2_auth_codes_client_id ON oauth2_authorization_codes (client_id);
CREATE INDEX idx_oauth2_auth_codes_user_id ON oauth2_authorization_codes (user_id);
CREATE INDEX idx_oauth2_auth_codes_expires ON oauth2_authorization_codes (expires_at_utc);

-- OAuth2 Refresh Tokens
CREATE TABLE oauth2_refresh_tokens (
    token_hash VARCHAR(128) PRIMARY KEY,
    client_id VARCHAR(100) NOT NULL,
    user_id UUID NOT NULL,
    scope VARCHAR(500) NOT NULL,
    family_id UUID NOT NULL,
    previous_token_hash VARCHAR(128),
    expires_at_utc TIMESTAMPTZ NOT NULL,
    revoked_at_utc TIMESTAMPTZ,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_oauth2_refresh_tokens_client_id ON oauth2_refresh_tokens (client_id);
CREATE INDEX idx_oauth2_refresh_tokens_user_id ON oauth2_refresh_tokens (user_id);
CREATE INDEX idx_oauth2_refresh_tokens_family_id ON oauth2_refresh_tokens (family_id);
CREATE INDEX idx_oauth2_refresh_tokens_expires ON oauth2_refresh_tokens (expires_at_utc);

-- Productos
CREATE TABLE productos (
    producto_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(200) NOT NULL,
    sku VARCHAR(50) NOT NULL,
    tipo_medida_base VARCHAR(20) NOT NULL,
    tipo_comercial_mayor VARCHAR(20) NOT NULL,
    unidades_por_caja INTEGER,
    unidades_por_bulto INTEGER,
    activo BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX idx_productos_sku ON productos (sku);
CREATE INDEX idx_productos_nombre ON productos (nombre);

-- Combos
CREATE TABLE combos (
    combo_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(50) NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'Borrador',
    sede_ids_habilitadas UUID[] NOT NULL DEFAULT '{}',
    precio_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    precio_total_moneda VARCHAR(3) NOT NULL DEFAULT 'USD',
    precio_promocional DECIMAL(12,2),
    precio_promocional_moneda VARCHAR(3)
);
CREATE INDEX idx_combos_estado ON combos (estado);
CREATE UNIQUE INDEX idx_combos_codigo ON combos (codigo);

-- Combo Items
CREATE TABLE combo_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    combo_id UUID NOT NULL REFERENCES combos(combo_id) ON DELETE CASCADE,
    producto_id UUID NOT NULL,
    cantidad DECIMAL(10,2) NOT NULL
);
CREATE INDEX idx_combo_items_combo_id ON combo_items (combo_id);

-- Precios Producto Sede
CREATE TABLE precios_producto_sede (
    precio_producto_sede_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id UUID NOT NULL,
    sede_id UUID NOT NULL,
    precio1_unidad DECIMAL(12,2) NOT NULL,
    precio1_moneda VARCHAR(3) NOT NULL DEFAULT 'USD',
    precio2_caja_bulto_pieza DECIMAL(12,2) NOT NULL,
    precio2_moneda VARCHAR(3) NOT NULL DEFAULT 'USD',
    precio3_mayor_desde2 DECIMAL(12,2) NOT NULL,
    precio3_moneda VARCHAR(3) NOT NULL DEFAULT 'USD',
    precio4_mayorista DECIMAL(12,2),
    precio4_moneda VARCHAR(3),
    precio4_requiere_acuerdo BOOLEAN NOT NULL DEFAULT false,
    vigente_desde TIMESTAMPTZ NOT NULL,
    vigente_hasta TIMESTAMPTZ
);
CREATE INDEX idx_precios_producto_sede_lookup ON precios_producto_sede (producto_id, sede_id, vigente_desde);

-- API Tokens
CREATE TABLE api_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(200) NOT NULL,
    token_hash VARCHAR(128) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_api_tokens_token_hash ON api_tokens (token_hash);
CREATE INDEX idx_api_tokens_activo ON api_tokens (activo);
