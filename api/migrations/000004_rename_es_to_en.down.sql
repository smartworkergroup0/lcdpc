-- Revert English names back to Spanish

-- =============================================
-- 1. Revert seed data: api_resources
-- =============================================
UPDATE api_resources SET name = 'Iniciar registro de cliente', description = 'Endpoint para iniciar flujo de registro y emitir OTP' WHERE code = 'auth.register.start';
UPDATE api_resources SET name = 'Health API Controller', description = 'Health endpoint del controlador API' WHERE code = 'health.api.get';
UPDATE api_resources SET description = 'Health check de infraestructura' WHERE code = 'health.probe.get';

-- =============================================
-- 2. Revert seed data: bundle status values
-- =============================================
UPDATE bundles SET status = 'Pausado' WHERE status = 'Paused';
UPDATE bundles SET status = 'Publicado' WHERE status = 'Published';
UPDATE bundles SET status = 'Borrador' WHERE status = 'Draft';

-- =============================================
-- 3. Revert seed data: RBAC resource codes
-- =============================================
UPDATE resources SET code = 'combo:pause' WHERE code = 'bundle:pause';
UPDATE resources SET code = 'combo:publish' WHERE code = 'bundle:publish';
UPDATE resources SET code = 'combo:delete' WHERE code = 'bundle:delete';
UPDATE resources SET code = 'combo:update' WHERE code = 'bundle:update';
UPDATE resources SET code = 'combo:view' WHERE code = 'bundle:view';
UPDATE resources SET code = 'combo:create' WHERE code = 'bundle:create';
UPDATE resources SET code = 'sede:view' WHERE code = 'branch:view';
UPDATE resources SET code = 'sede:create' WHERE code = 'branch:create';

-- =============================================
-- 4. Revert seed data: role codes
-- =============================================
UPDATE roles SET code = 'admin_global', name = 'admin_global', description = 'Administrador con alcance global' WHERE code = 'global_admin';
UPDATE roles SET code = 'admin_sede', name = 'admin_sede', description = 'Administrador con alcance a sedes asignadas' WHERE code = 'branch_admin';
UPDATE roles SET code = 'cliente', name = 'cliente', description = 'Rol cliente para operaciones comerciales' WHERE code = 'client';

-- =============================================
-- 5. Revert FK reference in orders
-- =============================================
ALTER TABLE orders DROP CONSTRAINT orders_branch_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE RESTRICT;

-- =============================================
-- 6. Revert FK references in product_branch_prices
-- =============================================
ALTER TABLE product_branch_prices DROP CONSTRAINT product_branch_prices_branch_id_fkey;
ALTER TABLE product_branch_prices DROP CONSTRAINT product_branch_prices_product_id_fkey;
ALTER TABLE product_branch_prices ADD CONSTRAINT precios_producto_sede_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE CASCADE;
ALTER TABLE product_branch_prices ADD CONSTRAINT precios_producto_sede_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos(producto_id) ON DELETE CASCADE;

-- =============================================
-- 7. Revert FK references in bundle_items
-- =============================================
ALTER TABLE bundle_items DROP CONSTRAINT bundle_items_product_id_fkey;
ALTER TABLE bundle_items DROP CONSTRAINT bundle_items_bundle_id_fkey;
ALTER TABLE bundle_items ADD CONSTRAINT combo_items_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos(producto_id) ON DELETE RESTRICT;
ALTER TABLE bundle_items ADD CONSTRAINT combo_items_combo_id_fkey FOREIGN KEY (combo_id) REFERENCES combos(combo_id) ON DELETE CASCADE;

-- =============================================
-- 8. Revert CHECK constraint and item_type values in order_items
-- =============================================
ALTER TABLE order_items DROP CONSTRAINT order_items_item_check;
UPDATE order_items SET item_type = 'combo' WHERE item_type = 'bundle';
UPDATE order_items SET item_type = 'producto' WHERE item_type = 'product';
ALTER TABLE order_items ADD CONSTRAINT order_items_item_check CHECK (
    (item_type = 'producto' AND producto_id IS NOT NULL AND combo_id IS NULL) OR
    (item_type = 'combo' AND combo_id IS NOT NULL AND producto_id IS NULL)
);

ALTER TABLE order_items DROP CONSTRAINT order_items_bundle_id_fkey;
ALTER TABLE order_items DROP CONSTRAINT order_items_product_id_fkey;
ALTER TABLE order_items ADD CONSTRAINT order_items_combo_id_fkey FOREIGN KEY (combo_id) REFERENCES combos(combo_id) ON DELETE RESTRICT;
ALTER TABLE order_items ADD CONSTRAINT order_items_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos(producto_id) ON DELETE RESTRICT;

-- =============================================
-- 9. Revert indexes
-- =============================================
ALTER INDEX idx_orders_branch_status RENAME TO idx_orders_sede_status;
ALTER INDEX idx_api_tokens_is_active RENAME TO idx_api_tokens_activo;
ALTER INDEX idx_product_branch_prices_lookup RENAME TO idx_precios_producto_sede_lookup;
ALTER INDEX idx_bundles_code RENAME TO idx_combos_codigo;
ALTER INDEX idx_bundles_status RENAME TO idx_combos_estado;
ALTER INDEX idx_products_name RENAME TO idx_productos_nombre;
ALTER INDEX idx_products_sku RENAME TO idx_productos_sku;
ALTER INDEX idx_branches_store_name RENAME TO idx_sedes_nombre_tienda;
ALTER INDEX idx_branches_tax_id RENAME TO idx_sedes_rif;

-- =============================================
-- 10. Revert columns: other tables
-- =============================================
ALTER TABLE order_items RENAME COLUMN bundle_id TO combo_id;
ALTER TABLE order_items RENAME COLUMN product_id TO producto_id;

ALTER TABLE orders RENAME COLUMN branch_id TO sede_id;

-- product_branch_prices.branch_id → sede_id
ALTER TABLE product_branch_prices RENAME COLUMN branch_id TO sede_id;

ALTER TABLE user_role_assignments RENAME COLUMN branch_ids TO sede_ids;

ALTER TABLE profiles RENAME COLUMN tax_id TO rif;

ALTER TABLE api_tokens RENAME COLUMN is_active TO activo;
ALTER TABLE api_tokens RENAME COLUMN name TO nombre;

-- =============================================
-- 11. Revert columns: product_branch_prices
-- =============================================
ALTER TABLE product_branch_prices RENAME COLUMN valid_until TO vigente_hasta;
ALTER TABLE product_branch_prices RENAME COLUMN valid_from TO vigente_desde;
ALTER TABLE product_branch_prices RENAME COLUMN price4_requires_agreement TO precio4_requiere_acuerdo;
ALTER TABLE product_branch_prices RENAME COLUMN price4_currency TO precio4_moneda;
ALTER TABLE product_branch_prices RENAME COLUMN price4_wholesale TO precio4_mayorista;
ALTER TABLE product_branch_prices RENAME COLUMN price3_currency TO precio3_moneda;
ALTER TABLE product_branch_prices RENAME COLUMN price3_wholesale_from2 TO precio3_mayor_desde2;
ALTER TABLE product_branch_prices RENAME COLUMN price2_currency TO precio2_moneda;
ALTER TABLE product_branch_prices RENAME COLUMN price2_box_bundle_piece TO precio2_caja_bulto_pieza;
ALTER TABLE product_branch_prices RENAME COLUMN price1_currency TO precio1_moneda;
ALTER TABLE product_branch_prices RENAME COLUMN price1_unit TO precio1_unidad;
ALTER TABLE product_branch_prices RENAME COLUMN product_id TO producto_id;
ALTER TABLE product_branch_prices RENAME COLUMN id TO precio_producto_sede_id;

-- =============================================
-- 12. Revert columns: bundle_items
-- =============================================
ALTER TABLE bundle_items RENAME COLUMN quantity TO cantidad;
ALTER TABLE bundle_items RENAME COLUMN product_id TO producto_id;
ALTER TABLE bundle_items RENAME COLUMN bundle_id TO combo_id;

-- =============================================
-- 13. Revert columns: bundles
-- =============================================
ALTER TABLE bundles RENAME COLUMN promotional_price_currency TO precio_promocional_moneda;
ALTER TABLE bundles RENAME COLUMN promotional_price TO precio_promocional;
ALTER TABLE bundles RENAME COLUMN total_price_currency TO precio_total_moneda;
ALTER TABLE bundles RENAME COLUMN total_price TO precio_total;
ALTER TABLE bundles RENAME COLUMN enabled_branch_ids TO sede_ids_habilitadas;
ALTER TABLE bundles RENAME COLUMN status TO estado;
ALTER TABLE bundles RENAME COLUMN name TO nombre;
ALTER TABLE bundles RENAME COLUMN code TO codigo;
ALTER TABLE bundles RENAME COLUMN bundle_id TO combo_id;

-- =============================================
-- 14. Revert columns: products
-- =============================================
ALTER TABLE products RENAME COLUMN is_active TO activo;
ALTER TABLE products RENAME COLUMN units_per_bundle TO unidades_por_bulto;
ALTER TABLE products RENAME COLUMN units_per_box TO unidades_por_caja;
ALTER TABLE products RENAME COLUMN wholesale_commercial_type TO tipo_comercial_mayor;
ALTER TABLE products RENAME COLUMN base_measure_type TO tipo_medida_base;
ALTER TABLE products RENAME COLUMN name TO nombre;
ALTER TABLE products RENAME COLUMN product_id TO producto_id;

-- =============================================
-- 15. Revert columns: branches
-- =============================================
ALTER TABLE branches RENAME COLUMN business_hours TO horario_atencion;
ALTER TABLE branches RENAME COLUMN secondary_contact_phone TO telefono_contacto_secundario;
ALTER TABLE branches RENAME COLUMN contact_phone TO telefono_contacto;
ALTER TABLE branches RENAME COLUMN address TO direccion;
ALTER TABLE branches RENAME COLUMN tax_id TO rif;
ALTER TABLE branches RENAME COLUMN store_name TO nombre_tienda;

-- =============================================
-- 16. Revert tables
-- =============================================
ALTER TABLE product_branch_prices RENAME TO precios_producto_sede;
ALTER TABLE bundle_items RENAME TO combo_items;
ALTER TABLE bundles RENAME TO combos;
ALTER TABLE products RENAME TO productos;
ALTER TABLE branches RENAME TO sedes;
