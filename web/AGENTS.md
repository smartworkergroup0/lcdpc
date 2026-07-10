# AGENTS

Frontend guidance for `web/`.

## Start here

- Use `pnpm` for JS/TS work
- Start: `pnpm start`
- Test: `pnpm test`
- Build: `pnpm build`

## Architecture

- Angular 20 standalone components only; no NgModules
- Prefer `inject()`, `signal()`, `computed()`, `effect()`
- Keep route-level pages in `src/app/pages/`
- Keep shared PrimeNG UI in `src/app/shared/`
- Keep models/services/stores in `src/app/core/`
- Services are `providedIn: 'root'` and map snake_case API payloads to camelCase models

## Auth and routing

- Auth uses PASETO cookies with `withCredentials: true`
- `authInterceptor` handles 401 → refresh → retry
- Skip auth shell on `/login` and `/register`
- Use guards and `hasPermission` for route and menu gating
- Hide UI when the user lacks permission; do not render disabled-only access
- Route/UI vocabulary stays in English

## UI rules

- PrimeNG dialogs must be non-draggable
- Float labels need `placeholder=" "` and dialog padding top of `20px`
- Use `loading="lazy"` on non-hero images and `/not-found.png` as fallback
- Keep buttons pointer-friendly and layouts precise
- Use `p-table` lazy mode for admin lists; do not add a separate paginator component

## CRUD and dialog patterns

- Admin lists use PrimeNG lazy tables; `loadItems()` receives `{ first, rows }` and maps to `offset`/`limit`
- Reset pagination when filters change
- Form dialogs use `visible`/`visibleChange`, `saved`, and `closed`
- Complex dialogs may use `back` for nested navigation
- Keep simple form dialogs small; use separate templates only when a dialog is genuinely complex

## Branch and permission behavior

- Users without `view:branch:all` must be auto-scoped to their branch in lists and create/edit forms
- Load branch options from admin branch endpoints when branch selection is needed
- Lists and forms should use the user's branch by default when branch-wide access is missing

## Domain conventions

- Document types are concatenated prefixes (`V`, `E`, `J`, `G`, `C`) plus number before API calls
- All order/product/bundle/admin flows should extend the current PrimeNG + signal patterns instead of introducing new state shape
- Preserve hidden-by-permission behavior across menus, pages, and actions
