ALTER TABLE service_accounts ADD COLUMN branch_id UUID REFERENCES branches(id);

UPDATE service_accounts
SET branch_id = (SELECT id FROM branches WHERE deleted_at_utc IS NULL ORDER BY created_at_utc LIMIT 1);

ALTER TABLE service_accounts ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX idx_service_accounts_branch_id ON service_accounts(branch_id) WHERE deleted_at_utc IS NULL;
