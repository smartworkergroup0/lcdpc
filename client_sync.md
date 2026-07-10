# Guía del Cliente — Sync API

Referencia para el sistema externo que envía datos al backend vía los endpoints de sync.

## Convenciones generales

- Todos los campos de identificación usan **códigos** (strings), nunca UUIDs internos.
- Los campos `code` de entidades maestras (brands, categories, branches, measurement_units, price_categories) deben existir previamente en el sistema destino. Si un código no existe, ese item se registra como error en la respuesta pero no revierte el resto del batch.
- El batch máximo es de **500 items** por request.
- Los precios en `prices` reemplazan TODOS los precios existentes del producto/bundle. Si el array viene vacío, se eliminan todos los precios.
- `null` en campos `*_code` opcionales se mapea a `NULL` en la base de datos (ej: `category_code: null` = sin categoría).
- Todos los `code` de entidades maestras deben ser **UPPERCASE** (brands, categories, branches, measurement_units, price_categories).

---

## POST /api/v1/sync/products

Upsert masivo de productos. Identificador único: `(code, branch_code)`.

### Campos del request

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `name` | string | Sí | Nombre del producto |
| `code` | string | Sí | Código/SKU del producto. Se almacena en `products.sku` |
| `is_active` | boolean | No | Estado activo/inactivo. Default: `false` |
| `brand_code` | string | Sí | Código de la marca. Debe existir en `brands.code` |
| `category_code` | string \| null | No | Código de la categoría. Debe existir en `categories.code` |
| `branch_code` | string \| null | No | Código de la sede. Debe existir en `branches.code` |
| `base_unit_code` | string \| null | No | Código de la unidad de medida. Debe existir en `measurement_units.code` |
| `stock` | int \| null | No | Stock total. Default: `0` |
| `prices` | array | No | Lista de precios. Reemplaza todos los existentes |

### Estructura de `prices[]`

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `code` | string \| null | No | Código de la categoría de precio. Debe existir en `price_categories.code`. `null` = precio base sin categoría |
| `amount` | number | Sí | Monto del precio (hasta 2 decimales) |

### Lógica de stock

- **Producto nuevo**: `stock_available = stock`, `stock_blocked = 0`
- **Producto existente**: se calcula el delta (`nuevo_stock - stock_actual`), se ajusta `stock_available` preservando el `stock_blocked` existente
- Validaciones: `stock >= 0`, `stock_available >= 0`, `stock_blocked <= stock`

### Ejemplo

```json
[
  {
    "name": "Pan de hamburguesa",
    "code": "PAN-001",
    "is_active": true,
    "brand_code": "BIMBO",
    "category_code": "PANES",
    "branch_code": "CAR-001",
    "base_unit_code": "UNIT",
    "stock": 100,
    "prices": [
      { "code": "RETAIL", "amount": 1.50 },
      { "code": "WHOLESALE", "amount": 1.20 },
      { "code": null, "amount": 1.00 }
    ]
  },
  {
    "name": "Salsa de tomate",
    "code": "SAL-001",
    "is_active": true,
    "brand_code": "HEINZ",
    "category_code": "SALSAS",
    "branch_code": "CAR-001",
    "base_unit_code": "UNIT",
    "stock": 200,
    "prices": []
  }
]
```

---

## POST /api/v1/sync/bundles

Upsert masivo de bundles con items, precios y stock encadenado. Identificador único: `(code, branch_code)`.

### Campos del request

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `code` | string | Sí | Código del bundle |
| `name` | string | Sí | Nombre del bundle |
| `is_active` | boolean | No | `true` → status "Active", `false` → status "Paused". Default: `false` |
| `branch_code` | string \| null | No | Código de la sede. Debe existir en `branches.code` |
| `category_code` | string \| null | No | Código de la categoría. Debe existir en `categories.code` |
| `items` | array | No | Productos que componen el bundle. Reemplaza todos los existentes |
| `prices` | array | No | Precios del bundle. Reemplaza todos los existentes |
| `stock` | int \| null | No | Stock total del bundle. Default: `0` |
| `blocks_product_stock` | boolean | No | Si `true`, el stock del bundle bloquea stock de sus productos componentes. Default: `false` |

### Estructura de `items[]`

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `product_code` | string | Sí | Código/SKU del producto componente. Debe existir en `products.sku` para la misma `branch_code` |
| `quantity` | number | Sí | Cantidad de ese producto por unidad de bundle |

### Estructura de `prices[]`

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `code` | string \| null | No | Código de la categoría de precio. Debe existir en `price_categories.code` |
| `amount` | number | Sí | Monto del precio |

### Stock encadenado (chain stock)

Cuando `blocks_product_stock = true` y `stock > 0`:

1. Se calcula el stock máximo posible según la disponibilidad de productos componentes (bottleneck): `min(floor(stock_available_producto / quantity))` para cada item
2. Si el `stock` solicitado excede el máximo, se rechaza con error `BUNDLE_STOCK_EXCEEDS_CHAIN`
3. Si es válido, se bloquea `quantity * bundle_stock` unidades de cada producto componente (`stock_available -= qty*stock`, `stock_blocked += qty*stock`)
4. En actualizaciones, primero se libera el stock bloqueado anterior antes de bloquear el nuevo

### Ejemplo

```json
[
  {
    "code": "COMBO-001",
    "name": "Combo hamburguesa",
    "is_active": true,
    "branch_code": "CAR-001",
    "category_code": "COMBOS",
    "items": [
      { "product_code": "PAN-001", "quantity": 2 },
      { "product_code": "SAL-001", "quantity": 1 }
    ],
    "prices": [
      { "code": "RETAIL", "amount": 8.50 },
      { "code": "WHOLESALE", "amount": 7.00 }
    ],
    "stock": 50,
    "blocks_product_stock": true
  }
]
```

---

## POST /api/v1/sync/products/{sku}/image

Subir/actualizar imagen de un producto por SKU.

- Content-Type: `multipart/form-data`
- Campo: `file` (max 5 MB)
- Tipos permitidos: `jpg`, `jpeg`, `png`, `webp`, `gif`
- El producto debe existir previamente (buscado por SKU)
- La imagen anterior se elimina automáticamente

### Response

```json
{"status": "success", "data": {"img": "/static/img/products/{uuid}.{ext}"}}
```

---

## POST /api/v1/sync/bundles/{code}/image

Subir/actualizar imagen de un bundle por código.

- Content-Type: `multipart/form-data`
- Campo: `file` (max 5 MB)
- Tipos permitidos: `jpg`, `jpeg`, `png`, `webp`, `gif`
- El bundle debe existir previamente (buscado por code)
- La imagen anterior se elimina automáticamente

### Response

```json
{"status": "success", "data": {"img": "/static/img/bundles/{uuid}.{ext}"}}
```

---

## Formato de respuesta

Todos los endpoints retornan JSend:

### Éxito

```json
{
  "status": "success",
  "data": {
    "processed": 10,
    "errors": 2,
    "details": [
      { "identifier": "PAN-001", "message": "brand_code \"XYZ\" not found" },
      { "identifier": "COMBO-05", "message": "product_code \"NO-EXISTE\" not found for branch" }
    ]
  }
}
```

- `processed`: cantidad de items procesados exitosamente
- `errors`: cantidad de items con error
- `details`: lista de errores (solo presente si hay errores). `identifier` es el `code` del item que falló

### Error de request

```json
{
  "status": "fail",
  "data": { "body": "max 500 items per request" }
}
```

---

## Códigos de error comunes

| Error | Causa |
|---|---|
| `name is required` | Campo `name` vacío |
| `code is required` | Campo `code` vacío |
| `brand_code is required` | Campo `brand_code` vacío |
| `brand_code "X" not found` | El código de marca no existe en el sistema |
| `category_code "X" not found` | El código de categoría no existe |
| `branch_code "X" not found` | El código de sede no existe |
| `base_unit_code "X" not found` | El código de unidad de medida no existe |
| `price_category_code "X" not found` | El código de categoría de precio no existe |
| `product with code "X" not found for branch` | El producto no existe para esa sede (bundle items) |
| `STOCK_BELOW_ZERO` | Stock negativo en producto existente |
| `STOCK_AVAILABLE_BELOW_ZERO` | Stock disponible negativo después del delta |
| `STOCK_BLOCKED_EXCEEDS_STOCK` | Stock bloqueado excede el stock total |
| `BUNDLE_STOCK_EXCEEDS_CHAIN: max N, requested M` | Stock del bundle excede lo que se puede armar con los productos disponibles |

---

## Reglas de negocio

1. **Precios se reemplazan completamente** — cada sync de precios DELETE + INSERT. Si `prices` viene vacío, se eliminan todos los precios existentes.
2. **Items de bundle se reemplazan completamente** — cada sync de items DELETE + INSERT.
3. **Stock de bundle se resetea** — en cada sync, `stock_available = stock` y `stock_blocked = 0`. El stock bloqueado por chain se recalcula.
4. **UUIDs internos se generan automáticamente** — el cliente nunca envía `product_id`, `bundle_id` ni ningún UUID. Todos se generan en el primer sync y se preservan en actualizaciones posteriores.
5. **Unicidad por sede** — productos se identifican por `(sku, branch_id)`, bundles por `(code, branch_id)`. El mismo `code` puede existir en diferentes sedes.
6. **El batch es parcialmente atómico** — un error en un item no revierte los demás. Los items exitosos se commitean.
7. **Imágenes son operaciones separadas** — se suben con un request individual por producto/bundle después del sync de datos.
8. **is_active en bundles** — se mapea al campo `status`: `true` → "Active", `false` → "Paused".
