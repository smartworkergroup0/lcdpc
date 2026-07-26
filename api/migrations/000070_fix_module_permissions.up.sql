-- Fix: Insert module permissions that failed in 000068 due to UUID conflicts
-- Uses ON CONFLICT (code) DO NOTHING so it's safe for both cases:
-- - 000068 ran but didn't insert (UUID conflicts)
-- - 000068 never ran
INSERT INTO resources (code) VALUES
    ('module:dashboard:view'),
    ('module:operaciones:view'),
    ('module:almacen:view'),
    ('module:personas:view'),
    ('module:configuracion:view'),
    ('module:asistente:view'),
    ('module:ventas:view'),
    ('module:ordenes:view'),
    ('module:matriz:view'),
    ('module:productos:view'),
    ('module:combos:view'),
    ('module:personal:view'),
    ('module:clientes:view'),
    ('module:rbac:view'),
    ('module:inventario:view'),
    ('module:administracion:view'),
    ('module:sistema:view'),
    ('module:flujos:view'),
    ('module:leads:view'),
    ('module:asistente_ordenes:view'),
    ('module:rbac:perfiles:view'),
    ('module:rbac:roles:view'),
    ('module:rbac:recursos:view'),
    ('module:rbac:api_tokens:view'),
    ('module:rbac:cuentas_servicio:view'),
    ('module:inventario:marcas:view'),
    ('module:inventario:categorias:view'),
    ('module:inventario:categorias_precio:view'),
    ('module:inventario:unidades_medida:view'),
    ('module:inventario:clasificaciones:view')
ON CONFLICT (code) DO NOTHING;

-- Assign module:dashboard:view to ALL roles so every user can access the dashboard
INSERT INTO role_resources (role_id, resource_id)
SELECT r.id, res.id
FROM roles r
CROSS JOIN resources res
WHERE res.code = 'module:dashboard:view'
ON CONFLICT (role_id, resource_id) DO NOTHING;

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
