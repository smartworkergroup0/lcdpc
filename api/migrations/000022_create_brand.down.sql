DELETE FROM role_resources WHERE resource_id IN (
    SELECT id FROM resources WHERE code IN ('brand:create', 'brand:view', 'brand:update', 'brand:delete')
);

DELETE FROM resources WHERE code IN ('brand:create', 'brand:view', 'brand:update', 'brand:delete');

DROP INDEX IF EXISTS idx_brands_code;
DROP TABLE brands;
