ALTER TABLE orders ADD COLUMN status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE orders o
SET status_changed_at = COALESCE(
    (SELECT MAX(created_at_utc) FROM order_status_history WHERE order_id = o.id),
    o.created_at_utc
);

CREATE INDEX idx_orders_auto_transition
    ON orders (status, status_changed_at)
    WHERE deleted_at IS NULL;
