DELETE FROM role_resources WHERE resource_id IN (
    SELECT id FROM resources WHERE code IN (
        'price_category:create', 'price_category:view', 'price_category:update', 'price_category:delete',
        'measurement_unit:create', 'measurement_unit:view', 'measurement_unit:update', 'measurement_unit:delete',
        'category:view'
    )
);

DELETE FROM resources WHERE code IN (
    'price_category:create', 'price_category:view', 'price_category:update', 'price_category:delete',
    'measurement_unit:create', 'measurement_unit:view', 'measurement_unit:update', 'measurement_unit:delete',
    'category:view'
);
