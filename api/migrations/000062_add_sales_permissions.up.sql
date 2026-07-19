-- Nuevos recursos para el modulo de ventas (POS)
INSERT INTO resources (id, code)
VALUES
  ('77777777-0000-0000-0000-000000000001', 'sales:view'),
  ('77777777-0000-0000-0000-000000000002', 'sales:create')
ON CONFLICT (code) DO NOTHING;

-- Asignar a global_admin
INSERT INTO role_resources (role_id, resource_id)
SELECT r.id, res.id
FROM roles r, resources res
WHERE r.code = 'global_admin' AND res.code IN ('sales:view', 'sales:create')
ON CONFLICT DO NOTHING;

-- Asignar a branch_admin
INSERT INTO role_resources (role_id, resource_id)
SELECT r.id, res.id
FROM roles r, resources res
WHERE r.code = 'branch_admin' AND res.code IN ('sales:view', 'sales:create')
ON CONFLICT DO NOTHING;

-- Asignar a manager
INSERT INTO role_resources (role_id, resource_id)
SELECT r.id, res.id
FROM roles r, resources res
WHERE r.code = 'manager' AND res.code IN ('sales:view', 'sales:create')
ON CONFLICT DO NOTHING;

-- Asignar a staff: solo sales:view
INSERT INTO role_resources (role_id, resource_id)
SELECT r.id, res.id
FROM roles r, resources res
WHERE r.code = 'staff' AND res.code = 'sales:view'
ON CONFLICT DO NOTHING;
