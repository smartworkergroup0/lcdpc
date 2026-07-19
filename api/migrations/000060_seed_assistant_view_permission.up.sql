INSERT INTO resources (id, code) VALUES
    (gen_random_uuid(), 'assistant:view')
ON CONFLICT (code) DO NOTHING;

-- Assign to global_admin role
INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code = 'assistant:view'
ON CONFLICT (role_id, resource_id) DO NOTHING;

-- Assign to admin_sede role
INSERT INTO role_resources (role_id, resource_id)
SELECT '22222222-2222-2222-2222-222222222222', id FROM resources
WHERE code = 'assistant:view'
ON CONFLICT (role_id, resource_id) DO NOTHING;
