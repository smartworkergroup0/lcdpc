ALTER TABLE categories RENAME COLUMN code TO slug;
ALTER INDEX idx_categories_code RENAME TO idx_categories_slug;
