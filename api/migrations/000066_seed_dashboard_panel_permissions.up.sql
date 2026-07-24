-- Seed dashboard:admin-panel:view and dashboard:operation-panel:view permissions
INSERT INTO resources (id, code) VALUES
    ('66666666-0000-0000-0000-000000000033', 'dashboard:admin-panel:view'),
    ('66666666-0000-0000-0000-000000000034', 'dashboard:operation-panel:view')
ON CONFLICT (id) DO NOTHING;

-- global_admin gets all dashboard permissions
INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code IN ('dashboard:admin-panel:view', 'dashboard:operation-panel:view')
ON CONFLICT (role_id, resource_id) DO NOTHING;
