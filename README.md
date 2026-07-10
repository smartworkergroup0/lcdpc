# LCDPC Monorepo

Backend Go + frontend Angular para el sistema LCDPC. OAuth 2.0 Authorization Server propio con PASETO v2.local, RBAC code-based y PostgreSQL.

## Quick Start

### Backend (Go)

```bash
cd api
cp .env.example .env
# Editar .env si es necesario (DB, email, etc.)

# Con Docker (recomendado):
docker compose up --build

# O local:
go run main/main.go
```

Verificar: `http://localhost:8080/health`

### Frontend (Angular)

```bash
cd web
pnpm install
pnpm start
```

Abrir: `http://localhost:4200`

## Estructura

```
.
├── api/                    # Backend Go
│   ├── main/main.go        # Entry point
│   ├── configs/            # Config loading (.env)
│   ├── internal/           # Paquetes por feature
│   │   ├── auth/           # Auth + OAuth2 server
│   │   ├── pricing/        # Products, bundles, prices
│   │   ├── branch/         # Branches
│   │   ├── category/       # Categories
│   │   ├── order/          # Orders + status transitions
│   │   ├── staff/          # Staff management
│   │   ├── rbac/           # RBAC store + CRUD
│   │   ├── email/          # Email sender (Resend/SMTP/Noop)
│   │   ├── sync/           # External sync API
│   │   ├── db/             # Connection, migrations, seed
│   │   └── http/           # Router, handlers, middleware
│   ├── migrations/         # SQL migrations (golang-migrate)
│   └── static/img/         # Uploaded images
├── web/                    # Frontend Angular 20
│   └── src/app/
│       ├── core/           # Auth, models, services
│       ├── pages/          # Route components (landing, admin, auth)
│       └── shared/         # Reusable UI (header, footer, catalog)
└── docs/                   # Architecture + SDD artifacts
```

## Autenticación

- **Tokens:** PASETO v2.local (XChaCha20-Poly1305), payload encriptado y opaco para clientes
- **Cookies:** `lcdpc_at` (access) y `lcdpc_rt` (refresh), HTTP-only
- **OAuth2:** Authorization Code + PKCE, custom server en `/oauth2/*`
- **Password hashing:** PBKDF2-SHA256, 100k iteraciones
- **Refresh tokens:** rotación con detección de robo por familia

## Email

El backend soporta dos drivers de email configurables via `EMAIL_DRIVER`:

| Driver | Uso | Config |
|--------|-----|--------|
| `resend` | Producción (API HTTP) | `RESEND_APITOKEN`, `RESEND_FROM_ADDRESS` |
| `smtp` | Desarrollo (catcher local) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_ADDRESS` |

Para desarrollo con Mailpit u otro catcher SMTP:
```
EMAIL_DRIVER=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
```

## Variables de entorno

Archivo: `api/.env` (copiar de `api/.env.example`)

### General
| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | `8080` | Puerto del servidor |
| `FRONTEND_URL` | `http://localhost:4200` | URL del frontend (CORS) |

### Base de datos
| Variable | Default |
|----------|---------|
| `DB_HOST` | `localhost` |
| `DB_PORT` | `5432` |
| `DB_USER` | `postgres` |
| `DB_PASSWORD` | `123456` |
| `DB_NAME` | `tuinvoice` |
| `DB_SSL` | `disable` |

### Auth
| Variable | Default |
|----------|---------|
| `AUTH_PASSWORD_RESET_TTL_MINUTES` | `30` |
| `AUTH_REVOKE_SESSIONS_ON_PASSWORD_RESET` | `true` |

### Google OAuth
| Variable | Default |
|----------|---------|
| `AUTH_GOOGLE_CLIENT_ID` | (vacío) |
| `AUTH_GOOGLE_CLIENT_SECRET` | (vacío) |
| `AUTH_GOOGLE_REDIRECT_URI` | `http://localhost:8080/api/v1/auth/register/google/callback` |
| `AUTH_GOOGLE_SCOPE` | `openid email profile` |

### OAuth2 / PASETO
| Variable | Default |
|----------|---------|
| `OAUTH2_ISSUER` | `http://localhost:8080` |
| `OAUTH2_AUDIENCE` | `lcdpc-api` |
| `OAUTH2_ACCESS_TOKEN_TTL_MINUTES` | `60` |
| `OAUTH2_REFRESH_TOKEN_TTL_DAYS` | `30` |
| `OAUTH2_AUTHORIZATION_CODE_TTL_MINUTES` | `10` |
| `PASETO_KEY_PATH` | (vacío = clave efímera) |

### Email
| Variable | Default |
|----------|---------|
| `EMAIL_DRIVER` | `resend` |
| `RESEND_APITOKEN` | (vacío) |
| `RESEND_FROM_ADDRESS` | `LCDPC <onboarding@resend.dev>` |
| `SMTP_HOST` | `localhost` |
| `SMTP_PORT` | `1025` |
| `SMTP_USERNAME` | (vacío) |
| `SMTP_PASSWORD` | (vacío) |
| `SMTP_FROM_ADDRESS` | `noreply@lcdpc.local` |

### CORS
| Variable | Default |
|----------|---------|
| `CORS_ALLOWED_ORIGINS` | `http://localhost:4200,http://localhost:3000,http://localhost:5173` |

## URLs útiles

| URL | Descripción |
|-----|-------------|
| `http://localhost:8080/health` | Readiness probe |
| `http://localhost:8080/api/health` | Health con DB ping |
| `http://localhost:8080/.well-known/openid-configuration` | OAuth2 discovery |
| `http://localhost:4200` | Frontend Angular |

## Comandos rápidos

```bash
# Backend
cd api && go run main/main.go          # Run local
cd api && go build -o server main/main.go  # Build binary
cd api && go test ./...                # Run tests
cd api && go vet ./...                 # Lint

# Frontend
cd web && pnpm install                 # Install deps
cd web && pnpm start                   # Dev server
cd web && pnpm build                   # Production build
cd web && pnpm test                    # Unit tests

# Docker
cd api && docker compose up --build    # Backend + PostgreSQL
```

## Migraciones

Las migraciones están en `api/migrations/` con formato `NNNNNN_snake_case.{up,down}.sql`. Se ejecutan automáticamente al iniciar el backend.

```
000001_initial_schema    # Users, profiles, roles, products, bundles, prices, OAuth2
000002_rbac              # Code-based RBAC (resources, role_resources, profile_role_assignments)
000003_orders            # Orders, order_items, order_status_history
000004_rename_es_to_en   # Spanish → English table/column names
000005_add_image_fields  # img column on products and bundles
000006_add_categories    # Categories table + FK on products/bundles
000007_assign_order_permissions
000008_add_staff         # Staff roles, profile simplification
000009_drop_legacy_tables # Drop api_resources, role_resource_permissions, user_role_assignments
```

## Documentación

- `AGENTS.md` — Guía para agentes IA (arquitectura, reglas, convenciones)
- `api/API_ENDPOINTS.md` — Documentación completa de endpoints
- `docs/sdd/README.md` — SDD principal
- `docs/backend/architecture/` — Arquitectura del backend

## Superusuario

Se crea automáticamente al iniciar (si no existe):

- Email: `admin@lcdpc.local` (configurable via `AUTH_SUPERUSER_EMAIL`)
- Password: `SuperPerro123!` (configurable via `AUTH_SUPERUSER_PASSWORD`)
- Rol: `global_admin`
