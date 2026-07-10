-- Remove order permissions from roles
DELETE FROM role_resources WHERE resource_id IN (
    SELECT id FROM resources WHERE code IN ('order:view', 'order:create', 'order:update', 'order:delete', 'order:status:change')
);
