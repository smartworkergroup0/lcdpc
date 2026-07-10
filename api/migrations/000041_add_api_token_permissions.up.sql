INSERT INTO resources (id, code) VALUES
    (gen_random_uuid(), 'api_token:view'),
    (gen_random_uuid(), 'api_token:create'),
    (gen_random_uuid(), 'api_token:update'),
    (gen_random_uuid(), 'api_token:delete')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code IN ('api_token:view', 'api_token:create', 'api_token:update', 'api_token:delete')
ON CONFLICT (role_id, resource_id) DO NOTHING;
