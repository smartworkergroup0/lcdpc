CREATE TABLE system_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    logo_path TEXT,
    icon_path TEXT,
    page_name VARCHAR(100) NOT NULL DEFAULT 'LCDPC',
    title VARCHAR(200) NOT NULL DEFAULT 'LCDPC',
    show_price_in_catalog BOOLEAN NOT NULL DEFAULT true,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO system_config (logo_path, icon_path, page_name, title, show_price_in_catalog, active)
VALUES ('/static/img/config/logo.png', '/static/img/config/icon.ico', 'LCDPC', 'LCDPC', true, true);

INSERT INTO resources (id, code) VALUES
    (gen_random_uuid(), 'system_config:view'),
    (gen_random_uuid(), 'system_config:update')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code IN ('system_config:view', 'system_config:update')
ON CONFLICT (role_id, resource_id) DO NOTHING;
