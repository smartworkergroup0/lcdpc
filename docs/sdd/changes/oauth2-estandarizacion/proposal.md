# Propuesta: Migrar autenticación a OAuth 2.0 Estándar (RFC 6749)

## Resumen

Reemplazar el sistema actual de tokens JWT custom + Google OAuth manual por una implementación completa de **OAuth 2.0** (RFC 6749) donde el API de LCDPC actúa como **Authorization Server**. Esto estandariza el flujo de autenticación, agrega Authorization Code con PKCE, refresh token rotation, token introspection, revocation estandarizada y metadata de descubrimiento (OIDC discovery).

## Problema

El sistema actual implementa su propio mecanismo de tokens JWT (access + refresh) con validación manual en middleware, y la integración con Google OAuth es manual (llamadas HTTP directas al endpoint de Google, manejo de state/cookies propio). Esto genera:

- No hay standardización de flujos: clientes (web, mobile, terceros) no pueden integrar auth sin acoplarse a la API custom.
- No hay endpoint de token discovery (`.well-known/openid-configuration`).
- No hay introspection de tokens ni revocation estándar.
- Google OAuth es manual, no usa las librerías estándar de .NET (`Microsoft.AspNetCore.Authentication.Google`).
- No hay rotación de refresh tokens (security best practice).
- No hay PKCE (Proof Key for Code Exchange), obligatorio para SPA/mobile.

## Solución propuesta

### 1. LCDPC API como OAuth 2.0 Authorization Server

El backend implementa los endpoints estándar de OAuth 2.0:

| Endpoint | Método | RFC | Descripción |
|----------|--------|-----|-------------|
| `/oauth2/authorize` | GET | RFC 6749 §4.1.1 | Authorization endpoint (redirect a Google o login local) |
| `/oauth2/token` | POST | RFC 6749 §4.1.3 | Token endpoint (authorization code exchange) |
| `/oauth2/introspect` | POST | RFC 7662 | Introspection de access token |
| `/oauth2/revoke` | POST | RFC 7009 | Revocation de refresh token |
| `/oauth2/device/authorization` | POST | RFC 8628 | Device authorization (opcional, futuro) |
| `/.well-known/openid-configuration` | GET | OIDC Discovery | Metadata de descubrimiento |

### 2. Flujo Authorization Code con PKCE

El flujo principal para la web SPA (Angular):

1. SPA genera `code_verifier` + `code_challenge` (S256)
2. SPA redirige a `GET /oauth2/authorize?client_id=lcdpc-web&redirect_uri=...&response_type=code&code_challenge=...&code_challenge_method=S256&scope=openid email profile`
3. Authorization Server autentica al usuario (local o vía Google)
4. Authorization Server redirige a `redirect_uri?code={authorization_code}`
5. SPA envía `POST /oauth2/token` con `grant_type=authorization_code&code=...&code_verifier=...&client_id=lcdpc-web`
6. Authorization Server responde con `{access_token, refresh_token, token_type, expires_in}`
7. SPA usa access token en header `Authorization: Bearer <token>`

### 3. Refresh Token Rotation

Cada vez que se usa un refresh token:
- Se emite un nuevo access token + nuevo refresh token
- El refresh token anterior se marca como consumido (one-time use)
- Si un refresh token consumido se intenta reutilizar → **revocar toda la familia de tokens** (detectar token theft)

### 4. Google OAuth como Identity Provider externo

En vez de llamadas HTTP manuales a Google:
- Usar `Microsoft.AspNetCore.Authentication.Google` como provider OIDC/OAuth2
- Google actúa como upstream Identity Provider
- El Authorization Server de LCDPC intercambia el code de Google por tokens propios

### 5. Token Format

- **Access tokens**: JWT firmado con RS256 (asymmetric), issuer = LCDPC API, audience = LCDPC API
- **Refresh tokens**: opacos (no JWT), almacenados en DB como `oauth2_refresh_tokens` table
- **Authorization codes**: opacos, almacenados en DB con TTL de 10 min, PKCE binding

### 6. Clientes registrados

| Client ID | Grant Types | Redirect URIs | PKCE Required | Descripción |
|-----------|-------------|---------------|---------------|-------------|
| `lcdpc-web` | authorization_code, refresh_token | `http://localhost:4200`, `https://...` | Sí (S256) | Frontend Angular |
| `lcdpc-api-internal` | client_credentials | N/A | No | Comunicación interna (futuro) |

### 7. Scopes

| Scope | Descripción |
|-------|-------------|
| `openid` | Requerido para OIDC |
| `email` | Acceso a email del usuario |
| `profile` | Acceso a datos de perfil |
| `admin` | Acceso a endpoints administrativos |
| `admin:sedes` | Acceso a gestión de sedes |
| `admin:users` | Acceso a gestión de usuarios |

## Impacto sobre el frontend actual

El frontend Angular necesita adaptarse a OAuth 2.0:

- **Antes**: POST `/api/v1/auth/login` → recibe `TokenPair` → cookies `httpOnly`
- **Después**: Redirección a `/oauth2/authorize` → callback con code → POST `/oauth2/token` → access token en memoria/cookie

**Estrategia de transición**: Mantener los endpoints `/api/v1/auth/*` existentes como **compatibilidad** durante la transición, marcándolos como deprecated. Una vez el frontend migre, se pueden eliminar.

## Decisiones técnicas

- Usar `Microsoft.AspNetCore.Authentication.JwtBearer` para validación de access tokens (ya se usa, solo cambia el issuer/signing key a RS256)
- Usar `Duende.IdentityServer` o implementación propia ligera → **Decidido: implementación propia** para mantener la simplicidad y evitar dependencias pesadas. Los endpoints son claros y el scope es controlado.
- Algoritmo de firma: **RS256** (asymmetric) → permite que el access token sea validado por terceros sin exponer el signing key
- Refresh tokens: **rotación obligatoria** con detección de reutilización
- Authorization codes: **TTL de 10 minutos**, uso único
- PKCE: **obligatorio para todos los clientes public** (SPA, mobile)

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Ruptura de clientes existentes | Mantener endpoints `/api/v1/auth/*` como deprecated durante la transición |
| Complejidad de implementación OAuth 2.0 | Seguir estrictamente RFC 6749, implementar endpoints uno a uno con tests |
| Migración de sesiones existentes | Todas las sesiones JWT actuales serán inválidas tras la migración (cambio de signing key a RS256) → los usuarios harán re-login |

## No incluido en este cambio

- OpenID Connect completo (ID tokens) → solo OAuth 2.0 + scope `openid` como convención
- Device authorization flow → diferido
- Consent screen para terceros → no hay clientes externos aún
- 2FA/MFA → ya está en el roadmap del spec original
