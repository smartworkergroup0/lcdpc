INSERT INTO resources (id, code) VALUES
    (gen_random_uuid(), 'client:view'),
    (gen_random_uuid(), 'client:delete')
ON CONFLICT (code) DO NOTHING;

-- Assign to global_admin role
INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code IN ('client:view', 'client:delete')
ON CONFLICT (role_id, resource_id) DO NOTHING;

-- Assign to branch_admin role
INSERT INTO role_resources (role_id, resource_id)
SELECT '22222222-2222-2222-2222-222222222222', id FROM resources
WHERE code IN ('client:view', 'client:delete')
ON CONFLICT (role_id, resource_id) DO NOTHING;
