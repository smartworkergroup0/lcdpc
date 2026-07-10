# AGENTS

Backend guidance for `api/`.

## Start here

- Use Docker when auth or DB behavior matters
- Local run: `go run main/main.go`
- Tests: `go test ./...`
- Build: `go build -o server main/main.go`

## Architecture

- Feature-based packages in `internal/`; no Clean Architecture layering
- Each feature owns service, models, and queries
- Handlers stay thin: parse input, call service, return JSend
- Middleware lives under `internal/http/middleware/`; response helpers under `internal/http/response/`
- Interfaces are defined in the consuming package, not the implementing package
- Use `*db.Queries` directly; do not add repository wrappers around sqlc
- Most feature packages use `*pgxpool.Pool` plus colocated `queries.sql`
- Migrations live in `migrations/` as `NNNNNN_snake_case.{up,down}.sql`

## Contracts to preserve

- Auth is PASETO v2.local; do not add JWT or JWKS flows
- Access tokens are validated by crypto only; no DB lookup required
- Cookies `lcdpc_at` and `lcdpc_rt` stay HTTP-only
- CORS must keep `AllowCredentials()`
- Responses use JSend; list endpoints use `{items,total_count,limit,offset}`
- Role checks use `RequirePermission(store, "resource:action")`
- Seeders run on startup; do not introduce migration runners unless asked
- Toggle endpoints should flip the boolean in SQL, not send full entities
- Permission codes are lowercase `resource:action`; domain codes stay uppercase

## Data and service patterns

- Use pointer fields for nullable values
- Keep request structs validated with `validate` tags
- Return `(*Model, error)` for single items and `([]Model, int, error)` for lists
- Parse filters in handlers, not services
- Default pagination is 10, max is 100
- New RBAC resources must be seeded in migrations
- `view:branch:all` controls multi-branch visibility for branch-scoped lists and admin branch selection

## Frequent gotchas

- OAuth2 server is custom-built; `golang.org/x/oauth2` is client-only for Google
- Refresh token rotation with family-based theft detection lives in `internal/auth/oauth2.go`
- Password hashing is PBKDF2-SHA256, 100k iterations
- `users.profile_id` points to `profiles.id`; there is no `profiles.user_id`
- Multiple users can share the same profile
- `UserModel.Name` is `*string`, not first/last name fields
- `view:branch:all` must be checked in handlers that scope products, bundles, orders, staff, and admin branch selection
