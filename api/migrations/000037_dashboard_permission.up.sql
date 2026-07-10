-- Add dashboard:view permission
INSERT INTO resources (id, code) VALUES
    ('66666666-0000-0000-0000-000000000032', 'dashboard:view')
ON CONFLICT (id) DO NOTHING;

-- global_admin gets dashboard:view (already gets all via 000002, but explicit for clarity)
INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code = 'dashboard:view'
ON CONFLICT (role_id, resource_id) DO NOTHING;
