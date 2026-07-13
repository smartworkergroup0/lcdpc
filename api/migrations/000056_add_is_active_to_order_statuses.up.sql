ALTER TABLE order_statuses ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX idx_order_statuses_is_active ON order_statuses(is_active);
