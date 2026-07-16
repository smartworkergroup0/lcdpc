DELETE FROM role_resources
WHERE resource_id IN (
    SELECT id FROM resources WHERE code IN ('client:view', 'client:delete')
);

DELETE FROM resources WHERE code IN ('client:view', 'client:delete');
