-- Add order-person linkage and allow guest checkout writes.

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS person_id UUID;

ALTER TABLE orders
    ALTER COLUMN client_user_id DROP NOT NULL;

UPDATE orders o
SET person_id = u.person_id
FROM users u
WHERE o.client_user_id = u.id
  AND o.person_id IS NULL
  AND u.person_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'orders_person_id_fkey'
    ) THEN
        ALTER TABLE orders
            ADD CONSTRAINT orders_person_id_fkey FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_person ON orders (person_id);

ALTER TABLE order_status_history
    ALTER COLUMN changed_by_user_id DROP NOT NULL;
