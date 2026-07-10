# LCDPC API — Architecture Blueprint

## Overview

Go backend with feature-based packages, PASETO v2.local auth, pgx + PostgreSQL. No Clean Architecture layering — each feature owns its service, models, and queries.

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Language | Go 1.25.0 |
| Router | `go-chi/chi/v5` |
| Database | PostgreSQL via `pgx/v5` |
| Auth | PASETO v2.local (`o1egl/paseto`) |
| Password hashing | PBKDF2-SHA256, 100k iterations |
| Migrations | `golang-migrate/migrate/v4` |
| Email | `resend/resend-go/v2` + SMTP via `gomail.v2` |
| Image processing | `nfnt/resize` + `golang.org/x/image` |
| Config | `joho/godotenv` + custom `configs.Load()` |

## Package Structure

```
api/
├── main/main.go              # Entry point, DI wiring
├── configs/config.go         # Config struct + env loading
├── migrations/               # SQL migrations (golang-migrate)
├── static/img/               # Uploaded images
└── internal/
    ├── auth/                 # Auth + OAuth2 server
    │   ├── service.go        # Registration, login, me, refresh, logout, forgot/reset password
    │   ├── oauth2.go         # OAuth2 authorize, token, introspect, revoke
    │   ├── paseto.go         # PASETO key service, token generation/validation
    │   ├── password.go       # HashPassword, VerifyPassword, GenerateOtp, HashToken
    │   └── queries.sql       # Reference SQL (queries are inline in service.go)
    ├── pricing/              # Products, bundles, prices
    │   ├── service.go        # CRUD for products, bundles, prices
    │   ├── filter.go         # ProductFilter, BundleFilter, parsing
    │   └── queries.sql
    ├── branch/               # Branches (sedes)
    │   └── service.go
    ├── category/             # Categories
    │   └── service.go
    ├── order/                # Orders + status transitions
    │   ├── service.go
    │   ├── handler.go
    │   ├── models.go
    │   └── statuses.go       # Valid transitions matrix
    ├── staff/                # Staff management
    │   └── service.go
    ├── rbac/                 # RBAC store + CRUD
    │   ├── store.go          # In-memory permission store (loaded from DB)
    │   ├── service.go        # Resource, role, profile CRUD
    │   └── handler.go
    ├── email/                # Email sender abstraction
    │   ├── sender.go         # Sender interface
    │   ├── resend.go         # Resend API implementation
    │   ├── smtp.go           # SMTP implementation (gomail)
    │   └── noop.go           # No-op fallback
    ├── sync/                 # External sync API (API key auth)
    │   └── service.go
    ├── db/                   # Database utilities
    │   ├── db.go             # Connect, RunMigrations
    │   └── seed.go           # Superuser, OAuth2 client, API token seeders
    ├── user/                 # User queries
    │   └── queries.sql
    ├── admin/                # Admin utilities
    └── http/                 # HTTP layer
        ├── server.go         # Router setup, route registration
        ├── handler/          # Thin HTTP handlers
        ├── response/         # JSend helpers (Success, Error, Fail, Paginated)
        └── middleware/        # PASETO auth, RBAC, CORS
```

## Architectural Rules

### Feature-based packages
- Each package in `internal/` owns its service, models, and SQL queries.
- No Clean Architecture layers (Domain, Application, Infrastructure).
- No repository pattern — use `*pgxpool.Pool` directly with inline SQL.

### Data access
- Most packages use raw `*pgxpool.Pool` with inline SQL queries.
- SQL queries are co-located in each feature package (`internal/*/queries.sql`).
- Migrations are in `migrations/` with format `NNNNNN_snake_case.{up,down}.sql`.
- Migrations run automatically on startup.

### Service layer pattern
- Services take `*pgxpool.Pool` in constructor.
- Structs have JSON tags matching DB column names.
- Request structs have `validate` tags.
- Nullable fields use pointer types (`*string`, `*int`, `*uuid.UUID`).
- Methods return `(*Model, error)` for single items, `([]Model, int, error)` for lists (with total count).

### Handler pattern
- Thin handlers: parse HTTP input → call service → JSend response.
- Multipart form for file uploads (form field + `file` field).
- `response.Success(w, data)` for 200, `response.Created(w, data)` for 201.
- `response.Error(w, statusCode, message)` for errors.
- `response.Fail(w, statusCode, data)` for validation errors.
- `response.Paginated(w, items, total, limit, offset)` for paginated lists.

### Interfaces
- Interfaces are defined in the consuming package, not the implementing package.
- Example: `auth` package defines `emailSender` interface; `email` package implements `Sender`.

### Routing
- Uses `chi` router with nested groups.
- Public GET routes at top level.
- Authenticated routes: `PASETOAuth → RequireAuth → RequirePermission(store, "resource:action")`.
- Route structure: `/api/v1/{resource}/` for CRUD.

## Auth Architecture

### Tokens
- **Access token:** PASETO v2.local (XChaCha20-Poly1305). Payload encrypted, opaque to clients.
- **Refresh token:** Opaque string, stored as SHA-256 hash in DB.
- **Cookies:** `lcdpc_at` (access) and `lcdpc_rt` (refresh), HTTP-only for legacy compatibility.

### OAuth2 Server
Custom-built (not using `golang.org/x/oauth2` as server):
- `GET /oauth2/authorize` — Authorization Code + PKCE (S256)
- `POST /oauth2/token` — Exchange code or refresh
- `POST /oauth2/introspect` — RFC 7662 token validation
- `POST /oauth2/revoke` — RFC 7009 token revocation

### Refresh token rotation
- Family-based theft detection in `internal/auth/oauth2.go`.
- Each refresh token belongs to a `family_id`.
- Reuse of a revoked token revokes the entire family.

### RBAC
- Code-based permissions (e.g., `product:create`, `bundle:update`).
- `RequirePermission(rbacStore, "resource:action")` middleware.
- In-memory store loaded from DB on startup (`rbac.Store.LoadFromDB`).
- New resources must be seeded in migrations.

## Email

Abstraction with three implementations behind `email.Sender` interface:

| Driver | Implementation | Use case |
|--------|---------------|----------|
| `resend` | `email.ResendSender` | Production (HTTP API) |
| `smtp` | `email.SMTPSender` | Development (Mailpit, Mailtrap) |
| `noop` | `email.NoopSender` | Fallback when no config |

Selected via `EMAIL_DRIVER` env var.

## Migrations

Format: `NNNNNN_snake_case.{up,down}.sql` in `api/migrations/`.

```
000001_initial_schema    # Core tables (users, profiles, roles, products, bundles, OAuth2)
000002_rbac              # Code-based RBAC (resources, role_resources, profile_role_assignments)
000003_orders            # Orders, order_items, order_status_history
000004_rename_es_to_en   # Spanish → English table/column names
000005_add_image_fields  # img column on products and bundles
000006_add_categories    # Categories table + FK
000007_assign_order_permissions
000008_add_staff         # Staff roles, profile simplification
000009_drop_legacy_tables # Remove old permission tables
```

## Seeders

Run on startup (idempotent):
1. **Superuser** — `global_admin` role, configurable email/password
2. **OAuth2 client** — `lcdpc-web` client for the Angular SPA
3. **API token** — Initial sync token (shown once in logs)

## Response Format

All responses use JSend:
```json
{"status": "success", "data": {...}}
{"status": "fail", "data": {"field": "error"}}
{"status": "error", "message": "ERROR_CODE"}
```

Paginated responses:
```json
{"status": "success", "data": {"items": [], "total_count": 0, "limit": 10, "offset": 0}}
```

## Static Files

Uploaded images stored in `static/img/`, served at `/static/img/{filename}` with 7-day cache headers.
