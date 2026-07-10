ALTER TABLE categories RENAME COLUMN slug TO code;
ALTER INDEX idx_categories_slug RENAME TO idx_categories_code;
