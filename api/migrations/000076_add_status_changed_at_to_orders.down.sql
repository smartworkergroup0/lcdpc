DROP INDEX IF EXISTS idx_orders_auto_transition;
ALTER TABLE orders DROP COLUMN status_changed_at;
