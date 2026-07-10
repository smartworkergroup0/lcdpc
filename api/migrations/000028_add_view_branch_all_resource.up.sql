-- Add view:branch:all resource: allows viewing all branches in admin section
-- Without it, users only see data for their assigned branch
INSERT INTO resources (id, code) VALUES
    (gen_random_uuid(), 'view:branch:all')
ON CONFLICT (code) DO NOTHING;

-- Assign to global_admin role
INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code = 'view:branch:all'
ON CONFLICT (role_id, resource_id) DO NOTHING;
