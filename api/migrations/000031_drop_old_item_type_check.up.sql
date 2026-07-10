-- Drop the old inline CHECK constraint from migration 000003 that still
-- restricts item_type to ('producto', 'combo'). The 000004 migration
-- replaced the values with ('product', 'bundle') but never dropped
-- this inline constraint whose auto-generated name is
-- order_items_item_type_check.
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_item_type_check;
