# Backend rules (Go)

## Architecture rules

- Feature-based packages in `internal/` (no Clean Architecture layering).
- No repository wrappers around sqlc — use `*db.Queries` directly.
- Interfaces are defined in the consuming package, not the implementing package.
- Auth tokens are PASETO v2.local (XChaCha20-Poly1305). The payload is encrypted and opaque to clients.
- The PASETO symmetric key is stored in `api/paseto.key` as 64 hex chars (32 bytes). If the env var `PASETO_DECRYPTION_KEY` is set (64 hex chars), the file is assumed encrypted with AES-256-GCM and is decrypted at startup before hex decoding. Without it, the file is read as plaintext hex (backward compatible).
- To encrypt an existing `paseto.key`: generate a master key with `openssl rand -hex 32`, then run `go run main/main.go -encrypt-paseto-key <master-key-hex>`.
- The encryption adds a 12-byte nonce prefix to the file (nonce + ciphertext). If the master key is lost, there is no recovery path for existing tokens.
- Cookies `lcdpc_at` and `lcdpc_rt` are HTTP-only for legacy compatibility.
- Role checks use `RequirePermission(store, "resource:action")` middleware; preserve that flow when adding protected endpoints.
- CORS must keep `AllowCredentials()` for auth to work cross-origin.
- Seeders run on startup (superuser, oauth2 client, api token). Do not introduce migration runners unless asked.
- API responses use JSend format (`{"status":"success","data":{}}`).
- All `code` fields (brands, categories, price_categories, measurement_units, etc.) must be UPPERCASE. The only exception is RBAC permission codes (`resource:action`), which are lowercase.

## Facts agents often guess wrong

- Auth uses PASETO v2.local, NOT JWT. Do not add JWT libraries or `/.well-known/jwks.json`.
- A valid PASETO token is enough for auth — no DB lookup needed for access token validity.
- Refresh token rotation with family-based theft detection is implemented in `internal/auth/oauth2.go`.
- Password hashing is PBKDF2-SHA256, 100k iterations, compatible with the previous C# hashes.
- The OAuth2 server is custom-built (authorize, token, introspect, revoke). It is NOT using `golang.org/x/oauth2` as a server.
- `golang.org/x/oauth2` is used only as a Google OAuth **client**.
- Package structure: `internal/auth/` (auth + OAuth2), `internal/pricing/` (products, bundles, prices), `internal/branch/`, `internal/category/`, `internal/sync/`, `internal/email/`, `internal/db/`, `internal/rbac/` (RBAC store + CRUD), `internal/order/` (orders, items, status transitions), `internal/staff/`, `internal/admin/`, `internal/user/`.
- **User-profile relationship**: `users` table has `name VARCHAR(200)` and `profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL`. `profiles` table has `id`, `name`, `code`, `created_at_utc`, `updated_at_utc` — NO `user_id` column. To get the profile for a user: `SELECT profile_id FROM users WHERE id = $1`. To get the user for a profile: `SELECT * FROM users WHERE profile_id = $1`. Multiple users can share the same profile. The `ProfileResponse` uses `user_count` (not `user_id`) to indicate how many users are assigned.
- **`UserModel`** in `internal/user/service.go` uses `Name *string` (not `FirstName`/`LastName`).

## Architectural standards

### Package structure
- Feature-based packages in `internal/` (no Clean Architecture layering).
- Each feature package owns its service, models, and queries.
- `internal/http/handler/` contains thin HTTP handlers — parse input, call service, return JSend.
- `internal/http/response/` contains JSend helpers + `Paginated()` for list endpoints.
- `internal/http/middleware/` contains PASETO auth, RBAC, CORS.

### Data access
- No repository wrappers around sqlc — use `*db.Queries` directly where sqlc is used.
- Most feature packages use raw `*pgxpool.Pool` with inline SQL queries.
- SQL queries are co-located in each feature package (`internal/*/queries.sql`).
- Migrations are in `migrations/` with format `NNNNNN_snake_case.{up,down}.sql`.

### Service layer pattern
- Services take `*pgxpool.Pool` in constructor.
- Structs have JSON tags matching DB column names.
- Request structs have `validate` tags.
- Nullable fields use pointer types (`*string`, `*int`, `*uuid.UUID`).
- Methods return `(*Model, error)` for single items, `([]Model, int, error)` for lists (with total count).
- Filter structs use variadic pattern: `func (s *Service) List(ctx, filter ...Filter) ([]Model, int, error)`.

### Handler pattern
- Thin handlers: parse HTTP input → call service → JSend response.
- Multipart form for file uploads (image field + `file` field).
- `response.Success(w, data)` for 200, `response.Created(w, data)` for 201.
- `response.Error(w, statusCode, message)` for errors.
- `response.Fail(w, statusCode, data)` for validation errors.
- `response.Paginated(w, items, total, limit, offset)` for paginated lists.

### Pagination and filtering
- List endpoints return paginated responses with `items`, `total_count`, `limit`, `offset`.
- Default limit is 10, max limit is 100.
- Filter structs are defined in the feature package (e.g., `pricing.ProductFilter`).
- Filter parsing happens in the handler, not the service.
- Query params: `limit`, `offset`, `category_id`, `name`, `sku`, `code`, `status`, `is_active`.

### Routing
- Uses `chi` router with nested groups.
- Public GET routes at top level.
- Authenticated routes: `PASETOAuth → RequireAuth → RequirePermission(store, "resource:action")`.
- Route structure: `/api/v1/{resource}/` for CRUD.
- Toggle endpoints (e.g., activate/deactivate) use `PATCH /{id}/toggle-action` with a dedicated service method that flips the boolean via `NOT is_active` in SQL. Never send the full entity to toggle a single field.

### RBAC
- Resources are code-based permissions (e.g., `product:create`, `bundle:update`).
- `RequirePermission(rbacStore, "resource:action")` middleware for protected endpoints.
- New resources must be seeded in migrations.

### Permission matrix

| Resource | create | view | update | delete | Extra |
|---|---|---|---|---|---|
| `product` | ✅ | ✅ | ✅ | ✅ | |
| `bundle` | ✅ | ✅ | ✅ | ✅ | `publish`, `pause` |
| `price` | ✅ | ✅ | ✅ | ✅ | |
| `brand` | ✅ | ✅ | ✅ | ✅ | |
| `category` | ✅ | ✅ | ✅ | ✅ | |
| `price_category` | ✅ | ✅ | ✅ | ✅ | |
| `measurement_unit` | ✅ | ✅ | ✅ | ✅ | |
| `branch` | ✅ | ✅ | — | — | |
| `staff` | ✅ | ✅ | ✅ | ✅ | |
| `order` | ✅ | ✅ | ✅ | ✅ | `status:change` |
| `rbac:resource` | ✅ | ✅ | ✅ | ✅ | |
| `rbac:role` | ✅ | ✅ | ✅ | ✅ | |
| `rbac:profile` | ✅ | ✅ | ✅ | ✅ | |
| `rbac:user` | — | — | ✅ | — | |
| `view:branch:all` | — | — | — | — | Extra: grants visibility of all branches in admin; users without it are auto-scoped to their assigned branch |
| `security-policy` | — | ✅ | ✅ | — | |

### Route → permission mapping

- **Products**: GET public, POST `product:create`, PUT `product:update`, DELETE `product:delete`
- **Bundles**: GET public, POST `bundle:create`, publish `bundle:publish`, pause `bundle:pause`, PUT `bundle:update`, DELETE `bundle:delete`
- **Prices**: GET public, POST `price:create`, PUT `price:update`, DELETE `price:delete`
- **Brands**: GET list public, GET by id `brand:view`, POST `brand:create`, PUT `brand:update`, DELETE `brand:delete`
- **Categories**: GET public, POST `category:create`, PUT `category:update`, DELETE `category:delete`
- **Price Categories**: GET public, POST `price_category:create`, PUT `price_category:update`, DELETE `price_category:delete`
- **Measurement Units**: GET public, POST `measurement_unit:create`, PUT `measurement_unit:update`, DELETE `measurement_unit:delete`
- **Measurement Unit Classifications**: GET public, POST/PUT/DELETE `measurement_unit:create/update/delete`
- **Conversion Factors**: GET public, POST/PUT/DELETE `measurement_unit:create/update/delete`
- **Branches**: GET public, POST `branch:create`. Branches have schedules in `branch_schedules` table (day_of_week 0-6 where 0=Lunes, start_time, end_time as TIME). Multiple ranges per day allowed. `business_hours` column was removed in migration 000025.
- **Staff**: GET public, POST `staff:create`, PUT `staff:update`, DELETE `staff:delete`
- **Orders**: GET/POST/PUT/DELETE `order:view/create/delete`, status change `order:status:change`
- **RBAC**: all endpoints require matching `rbac:resource/role/profile:view/create/update/delete`
- **Auth**: login/register/public, `/me`+`/refresh`+`/logout` auth-only, `/security-policy` PUT `security-policy:update`
- **Sync**: API Key protected

### Branch-scoped access (backend)

The `view:branch:all` permission controls multi-branch visibility:

- **PASETO token** embeds `branch_id` at login/refresh via `TokenClaims.BranchID`. Existing tokens without it are handled gracefully.
- **Middleware** (`middleware/auth.go`): `GetBranchID(ctx)` retrieves the user's branch from context; `HasPermission(ctx, store, code)` checks RBAC.
- **List handlers** for products, bundles, orders, and staff must auto-filter by `branch_id` when `view:branch:all` is absent. Pattern in each handler:

```go
branchID := middleware.GetBranchID(r.Context())
if !middleware.HasPermission(r.Context(), s.rbac, "view:branch:all") && branchID != "" {
    f.BranchID = &branchID
}
```

- **Admin branch endpoint** (`GET /api/v1/branches/admin`): returns only the user's branch when `view:branch:all` is absent; all branches when present.
- **Handler constructors** for products, bundles, orders, staff, and branches must accept `rbac.Store` to enable permission checks.

### Response format
- All responses use JSend: `{"status":"success","data":{}}` or `{"status":"error","message":"..."}`.
- Paginated responses: `{"status":"success","data":{"items":[],"total_count":0,"limit":10,"offset":0}}`.

### System Config (backend)

- Package: `internal/systemconfig/` with `service.go`
- Table: `system_config` with columns: `id`, `logo_path`, `icon_path`, `page_name`, `title`, `show_price_in_catalog`, `active`, `created_at`, `updated_at`
- RBAC resources: `system_config:view`, `system_config:update` (seeded to `global_admin`)
- `GetActive()` returns the active record or hardcoded defaults if none exists
- `Create()` and `Update()` with singleton logic: when `active=true`, all other records are deactivated first
- File uploads: `validateLogoFile()` accepts jpg/png/webp/gif, `validateIconFile()` accepts only `.ico`
- Images saved to `static/img/config/`

#### Protected Endpoints (CRUD)
| Method | Route | Permission |
|---|---|---|
| GET | `/api/v1/system-config/` | `system_config:view` |
| GET | `/api/v1/system-config/active` | `system_config:view` |
| POST | `/api/v1/system-config/` | `system_config:update` |
| PUT | `/api/v1/system-config/{id}` | `system_config:update` |

#### Public Endpoints (individual fields, no auth)
| Method | Route | Response |
|---|---|---|
| GET | `/api/v1/system/logo` | `{"logo_path": "..."}` |
| GET | `/api/v1/system/icon` | `{"icon_path": "..."}` |
| GET | `/api/v1/system/page-name` | `{"page_name": "..."}` |
| GET | `/api/v1/system/title` | `{"title": "..."}` |
| GET | `/api/v1/system/show-price` | `{"show_price_in_catalog": true}` |

### Order status flow (backend)
- Full transition map defined in `api/internal/order/statuses.go` (`allowedTransitions`).
- Terminal statuses (no further transitions): `REJECTED_BY_VALIDATION`, `DELIVERY_FAILED`, `COMPLETED`, `CANCELLED_BY_CUSTOMER`.
- `Delete()` is only allowed for orders in `PENDING_REVIEW` status. Sets `deleted_at = now()` (soft delete) and releases stock. No `order_status_history` insert.

#### Stock blocking and releasing
- **Blocking** (order creation): When an order is created, for each product item:
  - `stock_available -= quantity`
  - `stock_blocked += quantity`
  - Validated: `stock_available >= quantity` AND `stock_blocked + quantity <= stock`. If either fails, the entire transaction rolls back.
- **Releasing** (order rejection/cancellation): When an order transitions to `CANCELLED_BY_CUSTOMER` or `REJECTED_BY_VALIDATION`, OR when an order is deleted:
  - For each product item in the order: `stock_available += quantity`, `stock_blocked -= quantity`.
  - Implemented in `releaseBlockedStock()` in `api/internal/order/service.go`.
  - Called from `Delete()` and `ChangeStatus()` (when `isStockReleaseStatus(toStatus)` is true).
- **Update** (order item editing): When items are edited in editable status:
  - First releases ALL blocked stock for existing items (`releaseBlockedStock`).
  - Deletes old items.
  - For each new product item: validates stock and blocks new quantity (same as `Create`).
  - If any validation fails, entire transaction rolls back (old stock restored via `defer tx.Rollback`).

### Image handling (backend)
- Static files served from `/static/*` with 7-day cache headers (resize via `?w=` and `?h=`)
- Backend stores images in `api/static/img/` with subdirectories: `products/`, `bundles/`, `config/`
- `saveUploadedFile(file, ext, subDir string)` creates the subdirectory if it doesn't exist
- `deleteOldFile(oldImg)` handles subdirectory paths correctly (trims `/static/img/` prefix, preserves subdirectory in the remaining path)

### External API integrations (backend)
- External API clients live in `api/internal/external/{service-name}/` (e.g., `external/assistant/`)
- Each package contains: `client.go` (HTTP client), `models.go` (domain types), `handler.go` (LCDPC endpoints)
- Config vars: `SMARTWORKER_API_URL`, `SMARTWORKER_USERNAME`, `SMARTWORKER_PASSWORD` (in `configs/config.go`)
- Routes: `/api/v1/external/{service-name}/{resource}` (e.g., `/api/v1/external/assistant/leads`)
- RBAC: permission code `{service-name}:view` (e.g., `assistant:view`)
- Client handles JWT auth token caching and refresh automatically

### Timezone policy (backend)

The system stores and transmits all timestamps in UTC. This is enforced at three levels:

1. **Go process**: `time.Local = time.UTC` is set at the start of `main()` (`api/main/main.go`). All `time.Time` marshaling produces RFC3339 with `Z` suffix, regardless of the host OS timezone.
2. **DB session**: `timezone=UTC` runtime parameter is set in `api/internal/db/db.go:Connect()`. This ensures `CURRENT_DATE`, `now()`, `TO_CHAR`, and all session-level date functions operate in UTC regardless of the PostgreSQL server's default timezone.
3. **Docker**: `TZ: UTC` is set on both `api` and `postgres` services in `docker-compose.yml` as a belt-and-suspenders measure.

Rules for new code:
- Never set `time.Local` to anything other than `time.UTC`.
- Never use `time.Now()` without `.UTC()` — though with `time.Local = time.UTC` both are equivalent, prefer `time.Now().UTC()` for explicit intent.
- All `TIMESTAMPTZ` columns use `now()` as default — this is correct and should continue.
- When returning timestamps to the frontend, always use `time.Time` with JSON tag — the standard marshaler produces the correct UTC RFC3339 format.
- Date filters (`date_from`, `date_to`) are interpreted as UTC boundaries.
- Display IDs and counters that depend on "today" use UTC days.
