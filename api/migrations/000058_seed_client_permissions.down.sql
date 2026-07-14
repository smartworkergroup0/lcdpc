DELETE FROM role_resources WHERE resource_id IN (
    SELECT id FROM resources WHERE code IN ('client:create', 'client:update')
);
DELETE FROM resources WHERE code IN ('client:create', 'client:update');
