-- Restore the old inline CHECK constraint
ALTER TABLE order_items ADD CONSTRAINT order_items_item_type_check CHECK (item_type IN ('producto', 'combo'));
