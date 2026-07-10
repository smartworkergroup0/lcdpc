ALTER TABLE orders DROP COLUMN IF EXISTS display_id;
DROP FUNCTION IF EXISTS generate_order_display_id();
DROP TABLE IF EXISTS order_display_id_counter;
