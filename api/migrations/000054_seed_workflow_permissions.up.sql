INSERT INTO resources (id, code) VALUES
    (gen_random_uuid(), 'workflow:view'),
    (gen_random_uuid(), 'workflow:create'),
    (gen_random_uuid(), 'workflow:update'),
    (gen_random_uuid(), 'workflow:delete')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code IN ('workflow:view', 'workflow:create', 'workflow:update', 'workflow:delete')
ON CONFLICT (role_id, resource_id) DO NOTHING;
