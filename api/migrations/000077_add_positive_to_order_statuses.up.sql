ALTER TABLE order_statuses ADD COLUMN positive BOOLEAN NOT NULL DEFAULT false;

UPDATE order_statuses SET positive = true WHERE code = 'COMPLETED';
