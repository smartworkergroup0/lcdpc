ALTER TABLE persons ADD COLUMN is_staff BOOLEAN NOT NULL DEFAULT false;

-- Backfill: persons with is_client = false are already staff/admin
UPDATE persons SET is_staff = true WHERE NOT is_client;
