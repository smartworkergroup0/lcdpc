DELETE FROM profile_role_assignments WHERE profile_id = '77777777-7777-7777-7777-777777777777';
DELETE FROM profiles WHERE id = '77777777-7777-7777-7777-777777777777';
DELETE FROM role_resources WHERE role_id = '66666666-6666-6666-6666-666666666666';
DELETE FROM roles WHERE id = '66666666-6666-6666-6666-666666666666';
DELETE FROM role_resources WHERE resource_id IN (SELECT id FROM resources WHERE code LIKE 'service_account:%');
DELETE FROM resources WHERE code LIKE 'service_account:%';
DROP TABLE IF EXISTS service_accounts;
