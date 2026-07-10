-- Migrate statuses from Draft/Published/Paused to Active/Inactive
UPDATE bundles SET status = 'Active' WHERE status IN ('Draft', 'Published', 'Paused');
UPDATE bundles SET status = 'Inactive' WHERE status NOT IN ('Draft', 'Published', 'Paused') AND status != 'Active';
ALTER TABLE bundles ALTER COLUMN status SET DEFAULT 'Active';

-- Drop currency columns
ALTER TABLE bundles DROP COLUMN IF EXISTS total_price_currency;
ALTER TABLE bundles DROP COLUMN IF EXISTS promotional_price_currency;

-- Drop price columns — now handled by bundle_prices
ALTER TABLE bundles DROP COLUMN IF EXISTS total_price;
ALTER TABLE bundles DROP COLUMN IF EXISTS promotional_price;

-- Create bundle_prices table
CREATE TABLE bundle_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_id UUID NOT NULL REFERENCES bundles(bundle_id) ON DELETE CASCADE,
    price_category_id UUID NOT NULL REFERENCES price_categories(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL
);
CREATE INDEX idx_bundle_prices_bundle_id ON bundle_prices(bundle_id);
