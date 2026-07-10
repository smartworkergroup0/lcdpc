ALTER TABLE order_status_history
    ALTER COLUMN changed_by_user_id SET NOT NULL;

DROP INDEX IF EXISTS idx_orders_person;

ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_person_id_fkey,
    DROP COLUMN IF EXISTS person_id,
    ALTER COLUMN client_user_id SET NOT NULL;
