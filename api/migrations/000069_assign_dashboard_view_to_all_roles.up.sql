-- Assign module:dashboard:view to ALL roles so every user can access the dashboard
INSERT INTO role_resources (role_id, resource_id)
SELECT r.id, res.id
FROM roles r
CROSS JOIN resources res
WHERE res.code = 'module:dashboard:view'
ON CONFLICT (role_id, resource_id) DO NOTHING;
