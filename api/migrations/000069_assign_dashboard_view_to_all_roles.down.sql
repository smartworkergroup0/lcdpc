-- Remove module:dashboard:view from all roles
DELETE FROM role_resources WHERE resource_id = (
    SELECT id FROM resources WHERE code = 'module:dashboard:view'
);
