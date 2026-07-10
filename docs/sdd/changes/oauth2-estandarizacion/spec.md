# Spec: OAuth 2.0 Authorization Server

## Estado

- Implementación backend completada hasta Fase 7: 2026-06-14
- Prioridad: Alta
- Dependencia: `usuarios-y-administradores` (usa las mismas entidades base)

## Contexto

La API de LCDPC actualmente implementa su propio sistema de autenticación basado en JWT custom con validación manual en middleware y una integración manual con Google OAuth. El sistema carece de standardización, discovery, introspection, revocation estandarizada, PKCE y refresh token rotation.

## Problema

- No hay endpoints OAuth 2.0 estándar (authorization, token, introspect, revoke).
- Google OAuth es implementación manual, no usa providers estándar de .NET.
- No hay PKCE → vulnerabilidad para SPA/mobile.
- No hay rotación de refresh tokens → riesgo de token theft.
- No hay metadata de descubrimiento (`.well-known/openid-configuration`).
- Los clientes (web, future mobile) no pueden integrarse con flujos estándar.

## Objetivo

Transformar la API de LCDPC en un **OAuth 2.0 Authorization Server** completo, manteniendo las entidades de usuario, sesión, roles y políticas existentes, pero reemplazando la capa de tokens y el flujo de autenticación por los estándares de OAuth 2.0 (RFC 6749) + PKCE (RFC 7636) + Token Revocation (RFC 7009) + Token Introspection (RFC 7662).

## Alcance funcional

### 1. Authorization Endpoint

`GET /oauth2/authorize`

**Parámetros:**
- `client_id` (requerido) → identifica el cliente registrado
- `response_type` (requerido) → `code` (Authorization Code)
- `redirect_uri` (requerido) → URI de callback registrada
- `scope` (opcional) → espacio separado por espacios, default `openid email profile`
- `state` (requerido para clientes public) → CSRF protection
- `code_challenge` (requerido para clientes public) → S256 PKCE
- `code_challenge_method` → `S256`

**Comportamiento:**
- Validar `client_id` contra tabla `oauth2_clients`
- Validar `redirect_uri` contra las registradas
- Validar scopes solicitados
- Si no hay sesión activa → redirigir a login local o Google
- Si hay sesión activa → generar `authorization_code` (opaco, TTL 10 min, PKCE binding)
- Redirigir a `redirect_uri?code={code}&state={state}`

### 2. Token Endpoint

`POST /oauth2/token`

**Content-Type:** `application/x-www-form-urlencoded`

**Grant Type: `authorization_code`:**
- `grant_type=authorization_code`
- `code` → authorization code recibido
- `redirect_uri` → debe coincidir con la del authorize
- `code_verifier` → PKCE verifier (S256)
- `client_id` → cliente registrado

**Grant Type: `refresh_token`:**
- `grant_type=refresh_token`
- `refresh_token` → refresh token opaco
- `client_id` → cliente registrado

**Respuesta exitosa:**
```json
{
  "access_token": "<JWT RS256>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "<opaco>",
  "scope": "openid email profile"
}
```

**Validaciones:**
- PKCE verifier debe hacer match con el code_challenge (S256)
- Authorization code: uso único, TTL 10 min
- Refresh token: rotación obligatoria (nuevo refresh token en cada uso)
- Si refresh token ya fue consumido → revocar toda la familia de tokens

### 3. Introspection Endpoint

`POST /oauth2/introspect`

**Parámetros:**
- `token` → access token o refresh token
- `token_type_hint` → `access_token` o `refresh_token`

**Respuesta:**
```json
{
  "active": true,
  "client_id": "lcdpc-web",
  "username": "user@example.com",
  "scope": "openid email profile",
  "exp": 1718308800,
  "iat": 1718305200,
  "sub": "<user-id>"
}
```

### 4. Revocation Endpoint

`POST /oauth2/revoke`

**Parámetros:**
- `token` → refresh token
- `token_type_hint` → `refresh_token`

**Comportamiento:**
- Marcar refresh token como revocado
- Revocar todos los refresh tokens de la misma familia
- Revocar access tokens asociados (via session cleanup)

### 5. Discovery Endpoint

`GET /.well-known/openid-configuration`

**Respuesta:**
```json
{
  "issuer": "http://localhost:8080",
  "authorization_endpoint": "http://localhost:8080/oauth2/authorize",
  "token_endpoint": "http://localhost:8080/oauth2/token",
  "introspection_endpoint": "http://localhost:8080/oauth2/introspect",
  "revocation_endpoint": "http://localhost:8080/oauth2/revoke",
  "jwks_uri": "http://localhost:8080/.well-known/jwks.json",
  "scopes_supported": ["openid", "email", "profile", "admin", "admin:sedes", "admin:users"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"]
}
```

### 6. JWKS Endpoint

`GET /.well-known/jwks.json`

Expone la clave pública RSA para validar access tokens JWT RS256.

### 7. Clientes OAuth 2.0

Tabla `oauth2_clients`:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `client_id` | string (PK) | Identificador único del cliente |
| `client_name` | string | Nombre descriptivo |
| `redirect_uris` | jsonb | Lista de URIs de callback permitidas |
| `grant_types` | jsonb | Grant types permitidos |
| `response_types` | jsonb | Response types permitidos |
| `scope` | string | Scopes máximos permitidos |
| `require_pkce` | bool | Si requiere PKCE |
| `token_endpoint_auth_method` | string | Método de auth en token endpoint |
| `created_at` | datetime | Fecha de creación |

**Clientes iniciales:**
- `lcdpc-web` → SPA Angular, authorization_code + refresh_token, PKCE obligatorio

### 8. Authorization Codes

Tabla `oauth2_authorization_codes`:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `code` | string (PK) | Código opaco |
| `client_id` | string FK | Cliente que solicitó |
| `user_id` | UUID FK | Usuario autenticado |
| `redirect_uri` | string | URI de callback |
| `scope` | string | Scopes aprobados |
| `code_challenge` | string | PKCE challenge (S256) |
| `code_challenge_method` | string | `S256` |
| `state` | string | State del cliente |
| `expires_at` | datetime | TTL (10 min) |
| `used_at` | datetime? | Timestamp de uso |
| `created_at` | datetime | Fecha de creación |

### 9. Refresh Tokens

Tabla `oauth2_refresh_tokens`:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `token` | string (PK) | Token opaco (hash en DB) |
| `client_id` | string FK | Cliente |
| `user_id` | UUID FK | Usuario |
| `scope` | string | Scopes |
| `family_id` | UUID | Familia de rotación |
| `previous_token` | string? | Hash del token anterior |
| `expires_at` | datetime | Expiración (30 días) |
| `revoked_at` | datetime? | Revocado |
| `created_at` | datetime | Fecha de creación |

**Regla de rotación:**
- Cada refresh token tiene un `family_id`
- Al usar un refresh token: se crea un nuevo token con el mismo `family_id` y `previous_token` apuntando al anterior
- Si se detecta que un refresh token ya fue consumido (está en la tabla con `used_at` set) → **revocar toda la familia** (todos los tokens con el mismo `family_id`)

### 10. Access Tokens (JWT RS256)

**Header:**
```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "lcdpc-2026-06"
}
```

**Payload:**
```json
{
  "iss": "http://localhost:8080",
  "aud": "lcdpc-api",
  "sub": "<user-id>",
  "client_id": "lcdpc-web",
  "scope": "openid email profile",
  "iat": 1718305200,
  "exp": 1718308800,
  "jti": "<unique-token-id>"
}
```

**Claims personalizados (incluidos en el token):**
- `roles` → array de roles del usuario (para autorización rápida)
- `permissions` → object con permisos por recurso (para frontend)

### 11. Google OAuth como Identity Provider

En vez de implementación manual:
- Usar `Microsoft.AspNetCore.Authentication.Google` como provider OAuth2
- Configurar como upstream identity provider en el authorization flow
- Cuando el usuario elige "Login con Google" en el authorize endpoint:
  1. Redirect a Google OAuth (con los scopes de Google)
  2. Google redirige de vuelta con un code
  3. La API intercambia el code de Google por user info
  4. La API crea/actualiza el usuario local y genera su propio authorization code
  5. Continúa el flujo OAuth 2.0 normal

### 12. Compatibilidad con endpoints existentes

Los endpoints `/api/v1/auth/*` se mantienen como **deprecated** durante la transición:
- `/api/v1/auth/login` → redirige internamente al flujo OAuth 2.0
- `/api/v1/auth/register/*` → se mantiene (el registro es pre-auth, no cambia)
- `/api/v1/auth/me` → usa el nuevo sistema de validación de tokens
- `/api/v1/auth/refresh` → mapea a `POST /oauth2/token` con `grant_type=refresh_token`
- `/api/v1/auth/logout` → mapea a `POST /oauth2/revoke`

## Reglas de dominio

- Authorization codes: **uso único**, TTL 10 minutos
- PKCE: **obligatorio para clientes public** (SPA, mobile)
- Access tokens: JWT RS256, TTL configurable (default 60 min)
- Refresh tokens: opacos, rotación obligatoria, TTL 30 días
- Si un refresh token de una familia se reutiliza → **revocar toda la familia** (detección de token theft)
- Introspection siempre responde el estado real del token (no cache)
- Revocation de refresh token → revoca toda la familia + access tokens asociados
- Google OAuth: el user info de Google se mapea al registro de 3 pasos si el usuario no existe localmente

## Criterios de aceptación

1. `GET /oauth2/authorize` con params válidos → redirige a login o genera authorization code
2. `POST /oauth2/token` con authorization code + PKCE verifier → devuelve access + refresh token
3. Access token es JWT RS256 válido con claims estándar + custom
4. Refresh token rotation funciona: cada refresh genera nuevo access + nuevo refresh
5. Reutilización de refresh token consumido → revoca familia completa
6. `POST /oauth2/introspect` con access token activo → `{"active": true, ...}`
7. `POST /oauth2/revoke` con refresh token → token y familia revocados
8. `GET /.well-known/openid-configuration` → metadata completa y correcta
9. `GET /.well-known/jwks.json` → clave pública RSA válida
10. Google OAuth funciona como identity provider upstream
11. Los endpoints `/api/v1/auth/*` siguen funcionando durante la transición
12. Validación de access token en middleware usa JWKS + RS256
13. PKCE con S256 es obligatorio para el cliente `lcdpc-web`

## Casos borde

- Authorization code usado dos veces → error `invalid_grant`
- PKCE verifier no hace match con code_challenge → error `invalid_grant`
- Refresh token de familia revocada → error `invalid_grant` + alerta de seguridad
- Token expirado en introspection → `{"active": false}`
- Client ID no registrado → error `invalid_client`
- Redirect URI no coincide con la registrada → error `invalid_grant`
- Scope no permitido para el cliente → error `invalid_scope`
- Google OAuth falla (code inválido, email no verificado) → error con mensaje descriptivo
- Usuario desactivado intenta autenticarse → error en authorize o token endpoint

## No funcionales

- Access tokens validados via JWKS (no hardcodear signing key)
- Refresh tokens almacenados como hash (bcrypt/SHA256) en DB, nunca en texto plano
- Authorization codes como hash en DB
- Todas las operaciones OAuth 2.0 auditadas (tabla existente de auditoría)
- Rate limiting en token endpoint (prevenir brute force)

## Artefactos de soporte

- Implementación propia de OAuth 2.0 (sin Duende IdentityServer)
- Algoritmo RS256 con par de claves RSA generado al startup (o desde config)
- Tablas nuevas: `oauth2_clients`, `oauth2_authorization_codes`, `oauth2_refresh_tokens`
- Migración de sesiones existentes: los usuarios harán re-login al cambiar a RS256
