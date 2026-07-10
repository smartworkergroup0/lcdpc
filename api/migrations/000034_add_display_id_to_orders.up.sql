-- Counter table for atomic daily sequential generation
CREATE TABLE order_display_id_counter (
    date_key DATE PRIMARY KEY,
    counter INTEGER NOT NULL DEFAULT 0
);

-- Function to generate display_id atomically
-- Format: LCDPC + DDMMYY + NNNN (e.g., LCDPC0207260001)
CREATE OR REPLACE FUNCTION generate_order_display_id() RETURNS VARCHAR(20) AS $$
DECLARE
    today DATE := CURRENT_DATE;
    seq INT;
BEGIN
    INSERT INTO order_display_id_counter (date_key, counter)
    VALUES (today, 1)
    ON CONFLICT (date_key) DO UPDATE SET counter = order_display_id_counter.counter + 1
    RETURNING counter INTO seq;

    RETURN 'LCDPC' || to_char(today, 'DDMMYY') || lpad(seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Add display_id column to orders
ALTER TABLE orders ADD COLUMN display_id VARCHAR(20) UNIQUE;
