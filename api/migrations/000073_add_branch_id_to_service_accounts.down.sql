DROP INDEX IF EXISTS idx_service_accounts_branch_id;
ALTER TABLE service_accounts DROP COLUMN IF EXISTS branch_id;
