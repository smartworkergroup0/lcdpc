DROP INDEX IF EXISTS idx_orders_smartworker_order_id;
ALTER TABLE orders DROP COLUMN IF EXISTS smartworker_order_id;
