-- Rename Spanish names to English

-- =============================================
-- 1. Rename tables
-- =============================================
ALTER TABLE sedes RENAME TO branches;
ALTER TABLE productos RENAME TO products;
ALTER TABLE combos RENAME TO bundles;
ALTER TABLE combo_items RENAME TO bundle_items;
ALTER TABLE precios_producto_sede RENAME TO product_branch_prices;

-- =============================================
-- 2. Rename columns: branches (was sedes)
-- =============================================
ALTER TABLE branches RENAME COLUMN nombre_tienda TO store_name;
ALTER TABLE branches RENAME COLUMN rif TO tax_id;
ALTER TABLE branches RENAME COLUMN direccion TO address;
ALTER TABLE branches RENAME COLUMN telefono_contacto TO contact_phone;
ALTER TABLE branches RENAME COLUMN telefono_contacto_secundario TO secondary_contact_phone;
ALTER TABLE branches RENAME COLUMN horario_atencion TO business_hours;

-- =============================================
-- 3. Rename columns: products (was productos)
-- =============================================
ALTER TABLE products RENAME COLUMN producto_id TO product_id;
ALTER TABLE products RENAME COLUMN nombre TO name;
ALTER TABLE products RENAME COLUMN tipo_medida_base TO base_measure_type;
ALTER TABLE products RENAME COLUMN tipo_comercial_mayor TO wholesale_commercial_type;
ALTER TABLE products RENAME COLUMN unidades_por_caja TO units_per_box;
ALTER TABLE products RENAME COLUMN unidades_por_bulto TO units_per_bundle;
ALTER TABLE products RENAME COLUMN activo TO is_active;

-- =============================================
-- 4. Rename columns: bundles (was combos)
-- =============================================
ALTER TABLE bundles RENAME COLUMN combo_id TO bundle_id;
ALTER TABLE bundles RENAME COLUMN codigo TO code;
ALTER TABLE bundles RENAME COLUMN nombre TO name;
ALTER TABLE bundles RENAME COLUMN estado TO status;
ALTER TABLE bundles RENAME COLUMN sede_ids_habilitadas TO enabled_branch_ids;
ALTER TABLE bundles RENAME COLUMN precio_total TO total_price;
ALTER TABLE bundles RENAME COLUMN precio_total_moneda TO total_price_currency;
ALTER TABLE bundles RENAME COLUMN precio_promocional TO promotional_price;
ALTER TABLE bundles RENAME COLUMN precio_promocional_moneda TO promotional_price_currency;

-- =============================================
-- 5. Rename columns: bundle_items (was combo_items)
-- =============================================
ALTER TABLE bundle_items RENAME COLUMN combo_id TO bundle_id;
ALTER TABLE bundle_items RENAME COLUMN producto_id TO product_id;
ALTER TABLE bundle_items RENAME COLUMN cantidad TO quantity;

-- =============================================
-- 6. Rename columns: product_branch_prices (was precios_producto_sede)
-- =============================================
ALTER TABLE product_branch_prices RENAME COLUMN precio_producto_sede_id TO id;
ALTER TABLE product_branch_prices RENAME COLUMN producto_id TO product_id;
ALTER TABLE product_branch_prices RENAME COLUMN precio1_unidad TO price1_unit;
ALTER TABLE product_branch_prices RENAME COLUMN precio1_moneda TO price1_currency;
ALTER TABLE product_branch_prices RENAME COLUMN precio2_caja_bulto_pieza TO price2_box_bundle_piece;
ALTER TABLE product_branch_prices RENAME COLUMN precio2_moneda TO price2_currency;
ALTER TABLE product_branch_prices RENAME COLUMN precio3_mayor_desde2 TO price3_wholesale_from2;
ALTER TABLE product_branch_prices RENAME COLUMN precio3_moneda TO price3_currency;
ALTER TABLE product_branch_prices RENAME COLUMN precio4_mayorista TO price4_wholesale;
ALTER TABLE product_branch_prices RENAME COLUMN precio4_moneda TO price4_currency;
ALTER TABLE product_branch_prices RENAME COLUMN precio4_requiere_acuerdo TO price4_requires_agreement;
ALTER TABLE product_branch_prices RENAME COLUMN vigente_desde TO valid_from;
ALTER TABLE product_branch_prices RENAME COLUMN vigente_hasta TO valid_until;

-- =============================================
-- 7. Rename columns: other tables
-- =============================================
ALTER TABLE api_tokens RENAME COLUMN nombre TO name;
ALTER TABLE api_tokens RENAME COLUMN activo TO is_active;

-- profiles.rif → tax_id
ALTER TABLE profiles RENAME COLUMN rif TO tax_id;

-- user_role_assignments.sede_ids → branch_ids
ALTER TABLE user_role_assignments RENAME COLUMN sede_ids TO branch_ids;

-- orders.sede_id → branch_id
ALTER TABLE orders RENAME COLUMN sede_id TO branch_id;

-- product_branch_prices.sede_id → branch_id
ALTER TABLE product_branch_prices RENAME COLUMN sede_id TO branch_id;

-- order_items.producto_id → product_id, combo_id → bundle_id
ALTER TABLE order_items RENAME COLUMN producto_id TO product_id;
ALTER TABLE order_items RENAME COLUMN combo_id TO bundle_id;

-- =============================================
-- 8. Rename indexes
-- =============================================
ALTER INDEX idx_sedes_rif RENAME TO idx_branches_tax_id;
ALTER INDEX idx_sedes_nombre_tienda RENAME TO idx_branches_store_name;
ALTER INDEX idx_productos_sku RENAME TO idx_products_sku;
ALTER INDEX idx_productos_nombre RENAME TO idx_products_name;
ALTER INDEX idx_combos_estado RENAME TO idx_bundles_status;
ALTER INDEX idx_combos_codigo RENAME TO idx_bundles_code;
ALTER INDEX idx_precios_producto_sede_lookup RENAME TO idx_product_branch_prices_lookup;
ALTER INDEX idx_api_tokens_activo RENAME TO idx_api_tokens_is_active;
ALTER INDEX idx_orders_sede_status RENAME TO idx_orders_branch_status;

-- =============================================
-- 9. Update FK references in order_items
-- =============================================
ALTER TABLE order_items DROP CONSTRAINT order_items_producto_id_fkey;
ALTER TABLE order_items DROP CONSTRAINT order_items_combo_id_fkey;
ALTER TABLE order_items ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE RESTRICT;
ALTER TABLE order_items ADD CONSTRAINT order_items_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES bundles(bundle_id) ON DELETE RESTRICT;

-- Update CHECK constraint and item_type values
ALTER TABLE order_items DROP CONSTRAINT order_items_item_check;
UPDATE order_items SET item_type = 'product' WHERE item_type = 'producto';
UPDATE order_items SET item_type = 'bundle' WHERE item_type = 'combo';
ALTER TABLE order_items ADD CONSTRAINT order_items_item_check CHECK (
    (item_type = 'product' AND product_id IS NOT NULL AND bundle_id IS NULL) OR
    (item_type = 'bundle' AND bundle_id IS NOT NULL AND product_id IS NULL)
);

-- =============================================
-- 10. Update FK references in bundle_items
-- =============================================
ALTER TABLE bundle_items DROP CONSTRAINT combo_items_combo_id_fkey;
ALTER TABLE bundle_items ADD CONSTRAINT bundle_items_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES bundles(bundle_id) ON DELETE CASCADE;
ALTER TABLE bundle_items ADD CONSTRAINT bundle_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE RESTRICT;

-- =============================================
-- 11. Update FK references in product_branch_prices
-- =============================================
ALTER TABLE product_branch_prices ADD CONSTRAINT product_branch_prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE;
ALTER TABLE product_branch_prices ADD CONSTRAINT product_branch_prices_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

-- =============================================
-- 12. Update FK reference in orders
-- =============================================
ALTER TABLE orders DROP CONSTRAINT orders_sede_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;

-- =============================================
-- 13. Update seed data: role codes
-- =============================================
UPDATE roles SET code = 'client', name = 'client', description = 'Client role for commercial operations' WHERE code = 'cliente';
UPDATE roles SET code = 'branch_admin', name = 'branch_admin', description = 'Administrator with scope to assigned branches' WHERE code = 'admin_sede';
UPDATE roles SET code = 'global_admin', name = 'global_admin', description = 'Administrator with global scope' WHERE code = 'admin_global';

-- =============================================
-- 14. Update seed data: RBAC resource codes
-- =============================================
UPDATE resources SET code = 'branch:create' WHERE code = 'sede:create';
UPDATE resources SET code = 'branch:view' WHERE code = 'sede:view';
UPDATE resources SET code = 'bundle:create' WHERE code = 'combo:create';
UPDATE resources SET code = 'bundle:view' WHERE code = 'combo:view';
UPDATE resources SET code = 'bundle:update' WHERE code = 'combo:update';
UPDATE resources SET code = 'bundle:delete' WHERE code = 'combo:delete';
UPDATE resources SET code = 'bundle:publish' WHERE code = 'combo:publish';
UPDATE resources SET code = 'bundle:pause' WHERE code = 'combo:pause';

-- =============================================
-- 15. Update seed data: bundle status values
-- =============================================
UPDATE bundles SET status = 'Draft' WHERE status = 'Borrador';
UPDATE bundles SET status = 'Published' WHERE status = 'Publicado';
UPDATE bundles SET status = 'Paused' WHERE status = 'Pausado';

-- =============================================
-- 16. Update api_resources seed data
-- =============================================
UPDATE api_resources SET name = 'Start client registration', description = 'Endpoint to start registration flow and emit OTP' WHERE code = 'auth.register.start';
UPDATE api_resources SET name = 'Health API Controller', description = 'API controller health endpoint' WHERE code = 'health.api.get';
UPDATE api_resources SET description = 'Infrastructure health check' WHERE code = 'health.probe.get';
