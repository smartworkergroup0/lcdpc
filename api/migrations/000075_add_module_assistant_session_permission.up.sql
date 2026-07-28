INSERT INTO resources (id, code) VALUES
    (gen_random_uuid(), 'module:assistant_session:view')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code = 'module:assistant_session:view'
ON CONFLICT (role_id, resource_id) DO NOTHING;
