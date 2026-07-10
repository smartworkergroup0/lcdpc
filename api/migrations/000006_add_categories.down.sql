ALTER TABLE bundles DROP COLUMN category_id;
ALTER TABLE products DROP COLUMN category_id;
DROP TABLE categories;

DELETE FROM resources WHERE code IN ('category:create', 'category:update', 'category:delete');
