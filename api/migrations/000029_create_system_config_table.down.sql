DROP TABLE IF EXISTS system_config;

DELETE FROM role_resources
WHERE resource_id IN (SELECT id FROM resources WHERE code IN ('system_config:view', 'system_config:update'));

DELETE FROM resources WHERE code IN ('system_config:view', 'system_config:update');
