DROP INDEX IF EXISTS idx_order_statuses_is_active;
ALTER TABLE order_statuses DROP COLUMN IF EXISTS is_active;
