DELETE FROM role_resources WHERE resource_id IN (
    SELECT id FROM resources WHERE code LIKE 'module:%'
);

DELETE FROM resources WHERE code LIKE 'module:%';
