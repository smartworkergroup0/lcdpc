# LCDPC Frontend

Angular 20 standalone application with PrimeNG 20, signals, and pnpm.

## Quick Start

```bash
pnpm install
pnpm start          # Dev server at http://localhost:4200
```

## Commands

```bash
pnpm start          # Start dev server
pnpm build          # Production build (output in dist/)
pnpm test           # Run unit tests
pnpm lint           # Lint with ESLint
```

## Architecture

- **Standalone components** — no NgModules
- **Signals** for state management (`signal()`, `computed()`)
- **PrimeNG 20** with Aura preset for UI components
- **SCSS** for styling
- **Package manager:** pnpm only

## Project Structure

```
src/app/
  core/
    auth/              # Auth store, interceptor, guards, init
    models/            # TypeScript interfaces matching API responses
    services/          # API services (one per domain)
  pages/
    landing-page/      # Home page with hero + catalog
    search-page/       # Catalog search with filters
    auth-page/         # Login page
    register-page/     # Multi-step registration (OTP + profile)
    admin/
      admin-layout     # Admin shell with sidebar
      dashboard/       # Admin dashboard
      products/        # Product CRUD
      bundles/         # Bundle CRUD
      orders/          # Order management
      staff/           # Staff management
  shared/
    header/            # Top navigation
    footer/            # Footer
    hero/              # Hero carousel
    catalog/           # Product catalog grid
    catalog-search/    # Search bar
    advanced-search/   # Advanced filters
    branches/          # Branch selector
```

## Key Patterns

### Services
- One service per domain (`product-api.service.ts`, `bundle-api.service.ts`, etc.)
- Inject `HttpClient` and `API_BASE_URL` injection token
- Private `map()` method converts snake_case API responses to camelCase models
- Auth-protected calls use `{ withCredentials: true }`

### Components
- `@Component` with `standalone: true`
- `inject()` for DI (not constructor injection)
- `signal()` for mutable state, `computed()` for derived state
- `OnInit` for data loading
- Image `loading="lazy"` on all non-hero images
- `(error)="onImageError($event)"` sets `/not-found.png` as fallback

### Routing
| Route | Component | Guard |
|-------|-----------|-------|
| `/` | LandingPageComponent | — |
| `/search` | SearchPageComponent | — |
| `/login` | AuthPageComponent | — |
| `/register` | RegisterPageComponent | — |
| `/admin` | AdminLayoutComponent | `adminGuard` |
| `/admin/dashboard` | DashboardPageComponent | — |
| `/admin/products` | ProductsPageComponent | `permissionGuard('product:view')` |
| `/admin/bundles` | BundlesPageComponent | `permissionGuard('bundle:view')` |
| `/admin/orders` | OrdersPageComponent | `permissionGuard('order:view')` |
| `/admin/staff` | StaffPageComponent | `permissionGuard('staff:view')` |

### Auth
- PASETO v2.local tokens via HTTP-only cookies
- `authInterceptor` handles 401 → refresh → retry
- `AuthStore` manages user state with signals
- Guards: `adminGuard`, `permissionGuard(code)`
- Directive: `hasPermission` for conditional rendering

## Environment

- `src/environments/environment.ts` — development (`apiBaseUrl: 'http://localhost:8080'`)
- `src/environments/environment.prod.ts` — production (`apiBaseUrl: ''`, same origin)
- `angular.json` has `fileReplacements` for production builds
