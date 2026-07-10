# Sync endpoints (Go)

## Overview

One-way inbound data push from an external system (legacy C# POS/inventory) into the Go backend. No outbound sync exists. Auth uses a separate API key system — independent of PASETO and RBAC.

## Auth

- Header: `X-API-Token` (raw token)
- Mechanism: SHA-256 hash of the token → compared against `api_tokens.token_hash` where `is_active = true`
- Middleware: `middleware.APIKeyAuth(pool)` in `api/internal/http/middleware/apikey.go`
- No RBAC permission checks — any valid active API token grants full sync access
- Seeder: runs on startup if `api_tokens` is empty; generates 32-byte random token (hex 64 chars), stores SHA-256 hash, logs raw token to stdout once (never retrievable again)

## Endpoints

All routes registered in `api/internal/server.go:536-543` under `/api/v1/sync/`.

### POST /api/v1/sync/products

Batch upsert products by `(sku, branch_id)`.

- Handler: `handler/sync.go:19` → `sync/service.go:69`
- Auth: API Key
- Body: JSON array of `SyncProductRequest`, max 500 items
- Response: `SyncResult` (`processed`, `errors`, `details[]`)

**Request struct:**
```json
[{
  "name": "string (required)",
  "code": "string (required, maps to products.sku)",
  "is_active": true,
  "brand_code": "string (required, resolves to brands.id, auto-creates if not found)",
  "brand_name": "string | null (display name for auto-create, defaults to brand_code)",
  "category_code": "string | null (resolves to categories.category_id)",
  "category_name": "string | null (display name for auto-create)",
  "branch_code": "string | null (resolves to branches.id)",
  "base_unit_code": "string | null (resolves to measurement_units.id, e.g. 'kg', 'unit')",
  "base_unit_name": "string | null (display name for auto-create)",
  "stock": 0,
  "prices": [{"code": "string | null (resolves to price_categories.id, auto-creates if not found)", "amount": 0.0}]
}]
```

**Stock delta logic (existing products):**
1. `SELECT product_id, stock, stock_blocked FROM products WHERE sku = $1 AND branch_id IS NOT DISTINCT FROM $2 FOR UPDATE`
2. `delta = newStock - currentStock`
3. `stockAvailable = (currentStock - currentBlocked) + delta`
4. Validates: `stock >= 0`, `stockAvailable >= 0`, `stockBlocked <= stock`
5. Upserts via `ON CONFLICT (sku, branch_id) DO UPDATE`
6. Replaces product prices: `DELETE FROM product_branch_prices WHERE product_id = $1`, then inserts each price from request

**New products:** `stockAvailable = stock`, `stockBlocked = 0`

**Code resolution:** All `_code` fields are resolved to their corresponding UUID primary keys. `brand_code`, `category_code`, `base_unit_code`, `prices[].code`, and `branch_code` support auto-creation — if the code is not found, the system creates the record automatically. Other codes (`branch_code`) are **pre-resolved before the item loop** and fail the entire request if any branch code is not found (fatal error).

### POST /api/v1/sync/bundles

Batch upsert bundles with items and prices, including chain stock management.

- Handler: `handler/sync.go:40` → `sync/service.go:172`
- Auth: API Key
- Body: JSON array of `SyncBundleRequest`, max 500 items
- Response: `SyncResult`

**Request struct:**
```json
[{
  "code": "string (required)",
  "name": "string (required)",
  "is_active": true,
  "branch_code": "string | null (resolves to branches.id)",
  "category_code": "string | null (resolves to categories.category_id)",
  "category_name": "string | null (display name for auto-create)",
  "items": [{"product_code": "string (product code/sku, resolves to product_id)", "quantity": 1.0}],
  "prices": [{"code": "string | null (resolves to price_categories.id, auto-creates if not found)", "amount": 0.0}],
  "stock": 0,
  "blocks_product_stock": false
}]
```

**5-step upsert per bundle (single transaction):**
1. **Release old chain stock** — if bundle exists AND `oldBlocksProductStock=true` AND `oldStock>0`: read old `bundle_items`, call `pricing.ReleaseProductStock()` to unblock product stock
2. **Upsert bundle** — `ON CONFLICT (code, branch_id) DO UPDATE`; sets `stock_available = stock`, `stock_blocked = 0`
3. **Replace items** — `DELETE FROM bundle_items WHERE bundle_id = $1`, then insert each new item (resolves item `product_code` → `product_id` via product lookup by sku + branch)
4. **Replace prices** — `DELETE FROM bundle_prices WHERE bundle_id = $1`, then insert each new price (resolves price `code` → `price_category_id`)
5. **Block new chain stock** — if `blocks_product_stock=true` AND `newStock>0`: `pricing.MaxBundleStock()` computes bottleneck, validates `newStock <= maxStock`, then `pricing.BlockProductStock()` blocks product stock

### POST /api/v1/sync/products/{sku}/image

Upload product image by SKU.

- Handler: `handler/sync.go:61`
- Auth: API Key
- Body: `multipart/form-data` with field `file` (max 5MB)
- Allowed types: jpg, png, webp, gif
- Saves to `api/static/img/products/`, updates DB, deletes old image
- Response: `{"img": "/static/img/products/{uuid}.{ext}"}`
- 404 if product not found

### POST /api/v1/sync/bundles/{code}/image

Upload bundle image by code.

- Handler: `handler/sync.go:108`
- Auth: API Key
- Body: `multipart/form-data` with field `file` (max 5MB)
- Allowed types: jpg, png, webp, gif
- Saves to `api/static/img/bundles/`, updates DB, deletes old image
- Response: `{"img": "/static/img/bundles/{uuid}.{ext}"}`
- 404 if bundle not found

## Transactional behavior

Both `SyncProducts` and `SyncBundles` wrap the entire batch in a single DB transaction. Individual item failures are recorded in `SyncResult.Details` but do NOT roll back the transaction — successfully processed items are committed. The transaction only rolls back if `tx.Commit()` fails.

Each item is wrapped in a **savepoint** (`SAVEPOINT sp_N` / `RELEASE SAVEPOINT sp_N` / `ROLLBACK TO SAVEPOINT sp_N`). This ensures that a failure in one item does not abort the entire transaction — the savepoint rolls back only the failed item's changes, allowing subsequent items to proceed normally.

**Exception:** `branch_code` resolution is **fatal** — all unique branch codes are pre-resolved before the item loop. If any branch code is not found, the entire request fails with an error and the transaction is rolled back.

### Pre-resolution of codes (batch dedup)

All codes that support auto-creation (`brand_code`, `prices[].code`) are **pre-resolved before the item loop**. This prevents duplicate auto-create conflicts when multiple items in the same batch reference the same non-existent code.

`branch_code` is also **pre-resolved** but for a different reason: invalid branch codes are **fatal errors** that abort the entire batch. If any `branch_code` is not found in the database, the transaction is rolled back and the request returns an error immediately.

**Pattern:**
1. Collect all unique codes from the entire batch
2. Resolve / auto-create them once (outside savepoints)
3. Use the pre-resolved map inside the item loop

This avoids the scenario where item A auto-creates code "X" inside its savepoint, fails for another reason (savepoint rolls back the creation), then item B tries to create "X" again → `duplicate key` error.

## Chain stock helpers (`pricing/chain.go`)

Used by bundle sync when `blocks_product_stock = true`:

| Function | Purpose |
|---|---|
| `MaxBundleStock(ctx, tx, items)` | For each item: `SELECT stock_available FOR UPDATE`, compute `floor(stockAvailable / quantity)`, return min (bottleneck) |
| `BlockProductStock(ctx, tx, items, bundleStock)` | Per item: `stock_available -= qty*bundleStock`, `stock_blocked += qty*bundleStock` |
| `ReleaseProductStock(ctx, tx, items, bundleStock)` | Per item: `stock_available += qty*bundleStock`, `stock_blocked -= qty*bundleStock` |

## DB tables involved

| Table | Key columns for sync |
|---|---|
| `api_tokens` | `token_hash`, `is_active` |
| `products` | `product_id`, `sku`, `branch_id`, `brand_id`, `category_id`, `base_unit_id`, `stock`, `stock_available`, `stock_blocked`, `img` |
| `bundles` | `bundle_id`, `code`, `branch_id`, `category_id`, `stock`, `stock_available`, `stock_blocked`, `blocks_product_stock`, `img` |
| `bundle_items` | `bundle_id`, `product_id`, `quantity` |
| `bundle_prices` | `bundle_id`, `price_category_id`, `amount` |
| `product_branch_prices` | `product_id`, `price_category_id`, `amount`, `currency` |
| `brands` | `id`, `code` |
| `categories` | `category_id`, `code` (renamed from slug) |
| `branches` | `id`, `code` |
| `measurement_units` | `id`, `code` |
| `price_categories` | `id`, `code` |

## Code resolution

All `_code` fields in the request are resolved to UUID primary keys before DB operations. If a code is not found, the item is recorded in `SyncResult.Details` as an error — it does NOT roll back other items in the batch.

| Request field | Resolves to | Lookup table | Lookup column |
|---|---|---|---|
| `brand_code` | `brands.id` | `brands` | `code` (auto-creates if missing) |
| `brand_name` | — | — | display name for auto-create (defaults to `brand_code`) |
| `category_code` | `categories.category_id` | `categories` | `code` |
| `category_name` | `categories.category_id` | `categories` | `name` (fallback) |
| `branch_code` | `branches.id` | `branches` | `code` |
| `base_unit_code` | `measurement_units.id` | `measurement_units` | `code` |
| `base_unit_name` | `measurement_units.id` | `measurement_units` | `name` (fallback) |
| `prices[].code` | `price_categories.id` | `price_categories` | `code` (auto-creates if missing) |
| `items[].product_code` | `products.product_id` | `products` | `sku` + `branch_id` |

### Auto-create for brands, categories, measurement units, and price categories

When `brand_code`, `category_code`, `base_unit_code`, or `prices[].code` is provided but not found in the DB, the system auto-creates the missing record:

1. Try by code (`WHERE code = $1`)
2. If not found, **INSERT** a new record:
   - `code` = slugified value (lowercase, no accents, hyphens)
   - `name` = the provided `_name` value (`brand_name`, `category_name`, `base_unit_name`), or the raw code value for brands/price categories

This ensures the sync never fails due to missing brands, categories, measurement units, or price categories.

## Relevant migrations

- `000001` — `api_tokens` table
- `000013` — `stock`, `stock_available`, `stock_blocked` on products and bundles
- `000014` — `measurement_units` table with `code` column
- `000015` — `conversion_factors` table, `base_unit_id` on products
- `000035` — `bundle_prices` table, `status` default on bundles
- `000036` — `blocks_product_stock` column on bundles
- `000038` — branch-scoped unique indexes: `UNIQUE (sku, branch_id)`, `UNIQUE (code, branch_id)`
- `000039` — `code` column added to `branches`
- `000040` — `slug` renamed to `code` in `categories`

## Source files

| File | Purpose |
|---|---|
| `api/internal/sync/service.go` | Service: batch upsert logic, image update methods |
| `api/internal/http/handler/sync.go` | HTTP handlers: decode, validate, call service, JSend |
| `api/internal/http/middleware/apikey.go` | API Key auth middleware |
| `api/internal/pricing/chain.go` | Chain stock helpers (MaxBundleStock, Block, Release) |
| `api/internal/db/seed.go:132` | API token seeder |
| `api/internal/server.go:536-543` | Route registration |

## Facts agents often guess wrong

- Sync does NOT use PASETO tokens — it uses a separate API key system.
- Sync does NOT check RBAC permissions — any valid API key grants full access.
- No frontend code calls these endpoints — they are server-to-server only.
- The batch is NOT all-or-nothing per item — individual failures are recorded but committed alongside successes.
- `stock_available` on upserted bundles is always reset to `stock` (ignores any existing blocked stock on the bundle itself).
- `UpdateProductImage` and `UpdateBundleImage` (by UUID) exist in the service but are NOT wired to any sync handler — only the BySKU/ByCode variants are used.
