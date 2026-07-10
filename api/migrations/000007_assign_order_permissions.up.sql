-- Assign order permissions to admin roles

-- global_admin gets all order permissions
INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code IN ('order:view', 'order:create', 'order:update', 'order:delete', 'order:status:change')
ON CONFLICT (role_id, resource_id) DO NOTHING;

-- branch_admin gets all order permissions
INSERT INTO role_resources (role_id, resource_id)
SELECT '22222222-2222-2222-2222-222222222222', id FROM resources
WHERE code IN ('order:view', 'order:create', 'order:update', 'order:delete', 'order:status:change')
ON CONFLICT (role_id, resource_id) DO NOTHING;

-- client gets order:view only (can see their own orders)
INSERT INTO role_resources (role_id, resource_id)
SELECT '11111111-1111-1111-1111-111111111111', id FROM resources
WHERE code IN ('order:view')
ON CONFLICT (role_id, resource_id) DO NOTHING;
