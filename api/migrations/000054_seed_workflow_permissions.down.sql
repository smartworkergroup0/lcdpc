DELETE FROM role_resources WHERE resource_id IN (SELECT id FROM resources WHERE code IN ('workflow:view', 'workflow:create', 'workflow:update', 'workflow:delete'));
DELETE FROM resources WHERE code IN ('workflow:view', 'workflow:create', 'workflow:update', 'workflow:delete');
