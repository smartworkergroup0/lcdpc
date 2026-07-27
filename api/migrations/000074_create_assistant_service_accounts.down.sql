DELETE FROM role_resources WHERE resource_id IN (SELECT id FROM resources WHERE code LIKE 'assistant_session:%');
DELETE FROM resources WHERE code LIKE 'assistant_session:%';
DROP INDEX IF EXISTS idx_asa_deleted_at;
DROP INDEX IF EXISTS idx_asa_branch_id;
DROP TABLE IF EXISTS assistant_service_accounts;
