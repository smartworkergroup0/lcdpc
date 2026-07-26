-- Seed module:*:view permissions for sidebar groups, items, and panels
INSERT INTO resources (id, code) VALUES
    -- Dashboard
    ('66666666-0000-0000-0000-000000000040', 'module:dashboard:view'),
    -- Sidebar groups
    ('66666666-0000-0000-0000-000000000041', 'module:operaciones:view'),
    ('66666666-0000-0000-0000-000000000042', 'module:almacen:view'),
    ('66666666-0000-0000-0000-000000000043', 'module:personas:view'),
    ('66666666-0000-0000-0000-000000000044', 'module:configuracion:view'),
    ('66666666-0000-0000-0000-000000000045', 'module:asistente:view'),
    -- Sidebar items
    ('66666666-0000-0000-0000-000000000046', 'module:ventas:view'),
    ('66666666-0000-0000-0000-000000000047', 'module:ordenes:view'),
    ('66666666-0000-0000-0000-000000000048', 'module:matriz:view'),
    ('66666666-0000-0000-0000-000000000049', 'module:productos:view'),
    ('66666666-0000-0000-0000-000000000050', 'module:combos:view'),
    ('66666666-0000-0000-0000-000000000051', 'module:personal:view'),
    ('66666666-0000-0000-0000-000000000052', 'module:clientes:view'),
    ('66666666-0000-0000-0000-000000000053', 'module:rbac:view'),
    ('66666666-0000-0000-0000-000000000054', 'module:inventario:view'),
    ('66666666-0000-0000-0000-000000000055', 'module:administracion:view'),
    ('66666666-0000-0000-0000-000000000056', 'module:sistema:view'),
    ('66666666-0000-0000-0000-000000000057', 'module:flujos:view'),
    ('66666666-0000-0000-0000-000000000058', 'module:leads:view'),
    ('66666666-0000-0000-0000-000000000059', 'module:asistente_ordenes:view'),
    -- RBAC tabs
    ('66666666-0000-0000-0000-000000000060', 'module:rbac:perfiles:view'),
    ('66666666-0000-0000-0000-000000000061', 'module:rbac:roles:view'),
    ('66666666-0000-0000-0000-000000000062', 'module:rbac:recursos:view'),
    ('66666666-0000-0000-0000-000000000063', 'module:rbac:api_tokens:view'),
    ('66666666-0000-0000-0000-000000000064', 'module:rbac:cuentas_servicio:view'),
    -- Inventario tabs
    ('66666666-0000-0000-0000-000000000065', 'module:inventario:marcas:view'),
    ('66666666-0000-0000-0000-000000000066', 'module:inventario:categorias:view'),
    ('66666666-0000-0000-0000-000000000067', 'module:inventario:categorias_precio:view'),
    ('66666666-0000-0000-0000-000000000068', 'module:inventario:unidades_medida:view'),
    ('66666666-0000-0000-0000-000000000069', 'module:inventario:clasificaciones:view')
ON CONFLICT (id) DO NOTHING;

-- Assign all module permissions to global_admin
INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code LIKE 'module:%'
ON CONFLICT (role_id, resource_id) DO NOTHING;

-- Assign all module permissions to manager
INSERT INTO role_resources (role_id, resource_id)
SELECT '55555555-5555-5555-5555-555555555555', id FROM resources
WHERE code LIKE 'module:%'
ON CONFLICT (role_id, resource_id) DO NOTHING;
