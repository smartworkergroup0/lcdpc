DELETE FROM role_resources WHERE resource_id IN (
    SELECT id FROM resources WHERE code IN ('api_token:view', 'api_token:create', 'api_token:update', 'api_token:delete')
);
DELETE FROM resources WHERE code IN ('api_token:view', 'api_token:create', 'api_token:update', 'api_token:delete');
