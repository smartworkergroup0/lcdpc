DELETE FROM role_resources WHERE resource_id IN (SELECT id FROM resources WHERE code = 'module:assistant_session:view');
DELETE FROM resources WHERE code = 'module:assistant_session:view';
