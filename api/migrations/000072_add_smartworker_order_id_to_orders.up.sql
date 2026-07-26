ALTER TABLE orders ADD COLUMN smartworker_order_id VARCHAR(100);
CREATE INDEX idx_orders_smartworker_order_id ON orders(smartworker_order_id) WHERE smartworker_order_id IS NOT NULL;
