DELETE FROM role_resources WHERE resource_id IN (SELECT id FROM resources WHERE code = 'branch:update');
DELETE FROM resources WHERE code = 'branch:update';
