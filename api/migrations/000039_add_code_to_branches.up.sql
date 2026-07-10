ALTER TABLE branches ADD COLUMN code VARCHAR(50);
UPDATE branches SET code = tax_id;
ALTER TABLE branches ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX idx_branches_code ON branches(code);
