-- Producto queries

-- name: CreateProducto :one
INSERT INTO productos (producto_id, nombre, sku, tipo_medida_base, tipo_comercial_mayor, unidades_por_caja, unidades_por_bulto, activo)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING producto_id, nombre, sku, tipo_medida_base, tipo_comercial_mayor, unidades_por_caja, unidades_por_bulto, activo;

-- name: GetProductoByID :one
SELECT producto_id, nombre, sku, tipo_medida_base, tipo_comercial_mayor, unidades_por_caja, unidades_por_bulto, activo
FROM productos
WHERE producto_id = $1;

-- name: GetProductoBySKU :one
SELECT producto_id, nombre, sku, tipo_medida_base, tipo_comercial_mayor, unidades_por_caja, unidades_por_bulto, activo
FROM productos
WHERE sku = $1;

-- name: ListProductos :many
SELECT producto_id, nombre, sku, tipo_medida_base, tipo_comercial_mayor, unidades_por_caja, unidades_por_bulto, activo
FROM productos
ORDER BY nombre;

-- name: ListActiveProductos :many
SELECT producto_id, nombre, sku, tipo_medida_base, tipo_comercial_mayor, unidades_por_caja, unidades_por_bulto, activo
FROM productos
WHERE activo = true
ORDER BY nombre;

-- name: UpdateProducto :one
UPDATE productos
SET nombre = $2, sku = $3, tipo_medida_base = $4, tipo_comercial_mayor = $5, unidades_por_caja = $6, unidades_por_bulto = $7
WHERE producto_id = $1
RETURNING producto_id, nombre, sku, tipo_medida_base, tipo_comercial_mayor, unidades_por_caja, unidades_por_bulto, activo;

-- name: DeleteProducto :exec
DELETE FROM productos WHERE producto_id = $1;

-- name: UpsertProducto :one
INSERT INTO productos (producto_id, nombre, sku, tipo_medida_base, tipo_comercial_mayor, unidades_por_caja, unidades_por_bulto, activo)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (sku) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    tipo_medida_base = EXCLUDED.tipo_medida_base,
    tipo_comercial_mayor = EXCLUDED.tipo_comercial_mayor,
    unidades_por_caja = EXCLUDED.unidades_por_caja,
    unidades_por_bulto = EXCLUDED.unidades_por_bulto,
    activo = EXCLUDED.activo
RETURNING producto_id, nombre, sku, tipo_medida_base, tipo_comercial_mayor, unidades_por_caja, unidades_por_bulto, activo;

-- Combo queries

-- name: CreateCombo :one
INSERT INTO combos (combo_id, codigo, nombre, estado, sede_ids_habilitadas, precio_total, precio_total_moneda, precio_promocional, precio_promocional_moneda)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING combo_id, codigo, nombre, estado, sede_ids_habilitadas, precio_total, precio_total_moneda, precio_promocional, precio_promocional_moneda;

-- name: GetComboByID :one
SELECT combo_id, codigo, nombre, estado, sede_ids_habilitadas, precio_total, precio_total_moneda, precio_promocional, precio_promocional_moneda
FROM combos
WHERE combo_id = $1;

-- name: GetComboByCodigo :one
SELECT combo_id, codigo, nombre, estado, sede_ids_habilitadas, precio_total, precio_total_moneda, precio_promocional, precio_promocional_moneda
FROM combos
WHERE codigo = $1;

-- name: ListCombos :many
SELECT combo_id, codigo, nombre, estado, sede_ids_habilitadas, precio_total, precio_total_moneda, precio_promocional, precio_promocional_moneda
FROM combos
ORDER BY nombre;

-- name: UpdateCombo :one
UPDATE combos
SET codigo = $2, nombre = $3, estado = $4, sede_ids_habilitadas = $5, precio_total = $6, precio_total_moneda = $7, precio_promocional = $8, precio_promocional_moneda = $9
WHERE combo_id = $1
RETURNING combo_id, codigo, nombre, estado, sede_ids_habilitadas, precio_total, precio_total_moneda, precio_promocional, precio_promocional_moneda;

-- name: UpdateComboEstado :exec
UPDATE combos SET estado = $2 WHERE combo_id = $1;

-- name: DeleteCombo :exec
DELETE FROM combos WHERE combo_id = $1;

-- Combo Items queries

-- name: CreateComboItem :one
INSERT INTO combo_items (id, combo_id, producto_id, cantidad)
VALUES ($1, $2, $3, $4)
RETURNING id, combo_id, producto_id, cantidad;

-- name: ListComboItemsByComboID :many
SELECT id, combo_id, producto_id, cantidad
FROM combo_items
WHERE combo_id = $1;

-- name: DeleteComboItemsByComboID :exec
DELETE FROM combo_items WHERE combo_id = $1;

-- Precio queries

-- name: CreatePrecio :one
INSERT INTO precios_producto_sede (precio_producto_sede_id, producto_id, sede_id, precio1_unidad, precio1_moneda, precio2_caja_bulto_pieza, precio2_moneda, precio3_mayor_desde2, precio3_moneda, precio4_mayorista, precio4_moneda, precio4_requiere_acuerdo, vigente_desde, vigente_hasta)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
RETURNING *;

-- name: GetPrecioByID :one
SELECT precio_producto_sede_id, producto_id, sede_id, precio1_unidad, precio1_moneda, precio2_caja_bulto_pieza, precio2_moneda, precio3_mayor_desde2, precio3_moneda, precio4_mayorista, precio4_moneda, precio4_requiere_acuerdo, vigente_desde, vigente_hasta
FROM precios_producto_sede
WHERE precio_producto_sede_id = $1;

-- name: ListPreciosByProductoID :many
SELECT precio_producto_sede_id, producto_id, sede_id, precio1_unidad, precio1_moneda, precio2_caja_bulto_pieza, precio2_moneda, precio3_mayor_desde2, precio3_moneda, precio4_mayorista, precio4_moneda, precio4_requiere_acuerdo, vigente_desde, vigente_hasta
FROM precios_producto_sede
WHERE producto_id = $1
ORDER BY vigente_desde DESC;

-- name: ListPreciosBySedeID :many
SELECT precio_producto_sede_id, producto_id, sede_id, precio1_unidad, precio1_moneda, precio2_caja_bulto_pieza, precio2_moneda, precio3_mayor_desde2, precio3_moneda, precio4_mayorista, precio4_moneda, precio4_requiere_acuerdo, vigente_desde, vigente_hasta
FROM precios_producto_sede
WHERE sede_id = $1
ORDER BY vigente_desde DESC;

-- name: GetActivePrecioByProductoSede :one
SELECT precio_producto_sede_id, producto_id, sede_id, precio1_unidad, precio1_moneda, precio2_caja_bulto_pieza, precio2_moneda, precio3_mayor_desde2, precio3_moneda, precio4_mayorista, precio4_moneda, precio4_requiere_acuerdo, vigente_desde, vigente_hasta
FROM precios_producto_sede
WHERE producto_id = $1 AND sede_id = $2 AND vigente_desde <= now() AND (vigente_hasta IS NULL OR vigente_hasta > now())
ORDER BY vigente_desde DESC
LIMIT 1;

-- name: UpdatePrecio :one
UPDATE precios_producto_sede
SET precio1_unidad = $2, precio1_moneda = $3, precio2_caja_bulto_pieza = $4, precio2_moneda = $5, precio3_mayor_desde2 = $6, precio3_moneda = $7, precio4_mayorista = $8, precio4_moneda = $9, precio4_requiere_acuerdo = $10, vigente_desde = $11, vigente_hasta = $12
WHERE precio_producto_sede_id = $1
RETURNING *;

-- name: DeletePrecio :exec
DELETE FROM precios_producto_sede WHERE precio_producto_sede_id = $1;
