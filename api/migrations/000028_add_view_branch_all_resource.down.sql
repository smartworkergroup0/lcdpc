-- Remove view:branch:all resource
DELETE FROM role_resources
WHERE resource_id IN (SELECT id FROM resources WHERE code = 'view:branch:all');

DELETE FROM resources WHERE code = 'view:branch:all';
