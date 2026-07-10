# Design: OAuth 2.0 Authorization Server

## Arquitectura general

```
┌─────────────┐     OAuth 2.0      ┌─────────────────────────────────────┐
│  Angular    │ ──────────────────> │  LCDPC.API (.NET 10)               │
│  SPA (web)  │ <───── tokens ──── │                                     │
└─────────────┘                     │  /oauth2/authorize (GET)            │
                                    │  /oauth2/token (POST)               │
                                    │  /oauth2/introspect (POST)          │
                                    │  /oauth2/revoke (POST)              │
                                    │  /.well-known/openid-configuration  │
                                    │  /.well-known/jwks.json             │
                                    │                                     │
                                    │  ┌─────────────────────────────┐   │
                                    │  │ OAuth2AuthorizationService  │   │
                                    │  │ (Application layer)         │   │
                                    │  └──────────────┬──────────────┘   │
                                    │                 │                  │
                                    │  ┌──────────────▼──────────────┐   │
                                    │  │ OAuth2Repository            │   │
                                    │  │ (Infrastructure layer)      │   │
                                    │  └──────────────┬──────────────   │
                                    └─────────────────┼──────────────────┘
                                                      │
                                    ┌─────────────────▼──────────────────┐
                                    │  PostgreSQL                         │
                                    │  - oauth2_clients                  │
                                    │  - oauth2_authorization_codes      │
                                    │  - oauth2_refresh_tokens           │
                                    │  - users (existing)                │
                                    │  - user_sessions (existing)        │
                                    └────────────────────────────────────
```

## Capas y responsabilidad

### LCDPC.Domain (sin cambios mayores)

- `User` → se mantiene igual
- `UserSession` → se mantiene para backward compat con `/api/v1/auth/*`
- Nuevas entidades de dominio (sin atributos de infra):
  - `OAuth2Client` → client_id, client_name, redirect_uris, grant_types, require_pkce
  - `OAuth2AuthorizationCode` → code, client_id, user_id, redirect_uri, scope, code_challenge, expires_at
  - `OAuth2RefreshToken` → token_hash, client_id, user_id, scope, family_id, previous_token_hash, expires_at, revoked_at

### LCDPC.Application

**Nuevos servicios:**

1. **`IOAuth2AuthorizationService`** — orquesta el flujo OAuth 2.0
   - `AuthorizeAsync(request)` → valida client, redirect_uri, scope, PKCE; genera authorization code
   - `ExchangeCodeAsync(code, verifier, redirect_uri, client_id)` → intercambia code por tokens
   - `RefreshTokenAsync(refresh_token, client_id)` → rota refresh token, emite nuevo par
   - `IntrospectTokenAsync(token)` → retorna estado del token
   - `RevokeTokenAsync(token)` → revoca refresh token + familia

2. **`IOAuth2TokenService`** — genera y valida tokens JWT RS256
   - `GenerateAccessTokenAsync(userId, clientId, scope)` → JWT RS256 con claims
   - `GenerateRefreshTokenAsync()` → token opaco + hash
   - `ValidateAccessTokenAsync(token)` → valida JWT contra JWKS

3. **`IOAuth2KeyService`** — gestiona claves RSA
   - `GetSigningKey()` → RSA private key para firmar
   - `GetJwks()` → RSA public key para JWKS endpoint

4. **`IOAuth2ClientService`** — gestiona clientes OAuth
   - `GetClientAsync(clientId)` → retorna cliente registrado
   - `ValidateRedirectUri(clientId, redirectUri)` → valida URI de callback

5. **`IGoogleOAuthService`** — integración con Google como IdP
   - `GetAuthorizationUrl(state, nonce)` → URL de Google OAuth
   - `ExchangeCodeForUserInfoAsync(code)` → intercambia Google code por user info
   - `GetPrefillFromGoogleClaims(claims)` → mapea claims de Google a perfil mínimo

**Contracts (DTOs):**

```csharp
// Request/Response de authorize
public record OAuth2AuthorizeRequest(string ClientId, string RedirectUri, string ResponseType, 
    string Scope, string State, string CodeChallenge, string CodeChallengeMethod);
public record OAuth2AuthorizeResult(bool Success, string? RedirectUrl, string? ErrorCode, string? ErrorDescription);

// Request/Response de token
public record OAuth2TokenRequest(string GrantType, string? Code, string? RedirectUri, 
    string? CodeVerifier, string? RefreshToken, string ClientId);
public record OAuth2TokenResponse(string AccessToken, string TokenType, int ExpiresIn, 
    string RefreshToken, string Scope);

// Introspection
public record OAuth2IntrospectRequest(string Token, string? TokenTypeHint);
public record OAuth2IntrospectResponse(bool Active, string? ClientId, string? Username, 
    string? Scope, long? Exp, long? Iat, string? Sub);

// Revocation
public record OAuth2RevokeRequest(string Token, string? TokenTypeHint);
public record OAuth2RevokeResponse(bool Success);

// JWKS
public record OAuth2JwksResponse(OAuth2JwkKey[] Keys);
public record OAuth2JwkKey(string Kty, string Kid, string Alg, string Use, string N, string E);
```

### LCDPC.Infrastructure

**Nuevos repositorios:**
- `IOAuth2ClientRepository` → CRUD de clientes OAuth
- `IOAuth2CodeRepository` → storage de authorization codes (hash)
- `IOAuth2RefreshTokenRepository` → storage de refresh tokens (hash + family tracking)

**Nuevas tablas (EF Core):**
- `OAuth2Clients` → clients registrados
- `OAuth2AuthorizationCodes` → codes (opacos, hash, TTL 10 min)
- `OAuth2RefreshTokens` → refresh tokens (hash, family_id, previous_token_hash)

**Key Service:**
- `RsaKeyService` → genera par de claves RSA al startup, cachea en memoria
- Las claves se pueden persistir en config para que no cambien entre restarts (opcional)

### LCDPC.API

**Nuevos controladores:**
- `OAuth2Controller` → endpoints `/oauth2/*`
- `DiscoveryController` → endpoints `/.well-known/*`

**Middleware actualizado:**
- `JwtBearer` validation → ahora usa JWKS endpoint para validar RS256
- Se mantiene `AccessTokenResolver` pero adaptado para el nuevo formato

**Endpoints existentes `/api/v1/auth/*`:**
- Se mantienen como compatibility layer
- Internamente redirigen al nuevo flujo OAuth 2.0

## Flujo completo: Login con OAuth 2.0 + PKCE

```
┌─────────┐              ┌──────────┐               ┌──────────┐
│  SPA    │              │  API     │               │   DB     │
────┬────┘              └────┬─────┘               └─────────┘
     │                        │                          │
     │ 1. Generate PKCE       │                          │
     │    (verifier+challenge)│                          │
     │                        │                          │
     │ 2. GET /oauth2/authorize?                        │
     │    client_id=lcdpc-web&                           │
     │    response_type=code&                            │
     │    redirect_uri=...&                              │
     │    scope=openid+email+profile&                    │
     │    code_challenge=...&                            │
     │    code_challenge_method=S256&                    │
     │    state=xyz                                      │
     │ ──────────────────────────────────────────────>  │
     │                        │                          │
     │                        │ 3. Validate client,      │
     │                        │    redirect_uri, scope   │
     │                        │    Check session          │
     │                        │    Generate auth code     │
     │                        │    (hash, store in DB)    │
     │                        │ ──────────────────────>  │
     │                        │ <──────────────────────  │
     │                        │                          │
     │ 4. 302 redirect        │                          │
     │    /callback?code=ABC&  │                          │
     │    state=xyz            │                          │
     │ <────────────────────────────────────────────────  │
     │                        │                          │
     │ 5. POST /oauth2/token  │                          │
     │    grant_type=authorization_code                  │
     │    code=ABC                                       │
     │    redirect_uri=...                               │
     │    code_verifier=...                              │
     │    client_id=lcdpc-web                            │
     │ ──────────────────────────────────────────────>  │
     │                        │                          │
     │                        │ 6. Validate code         │
     │                        │    Validate PKCE          │
     │                        │    (S256 match)           │
     │                        │    Generate access token  │
     │                        │    (JWT RS256)            │
     │                        │    Generate refresh token │
     │                        │    (opaque, hash, store)  │
     │                        │ ─────────────────────>  │
     │                        │ <──────────────────────  │
     │                        │                          │
     │ 7. {access_token,       │                          │
     │    refresh_token,       │                          │
     │    expires_in}          │                          │
     │ <────────────────────────────────────────────────  │
     │                        │                          │
     │ 8. Store tokens         │                          │
     │    (access in memory,   │                          │
     │     refresh in cookie)  │                          │
     │                        │                          │
```

## Refresh Token Rotation

```
┌─────────┐              ┌──────────┐               ┌──────────┐
│  SPA    │              │  API     │               │   DB     │
└────┬────┘              └────┬─────┘               └────┬─────┘
     │                        │                          │
     │ 1. POST /oauth2/token  │                          │
     │    grant_type=refresh_token                       │
     │    refresh_token=RT1                              │
     │    client_id=lcdpc-web                            │
     │ ──────────────────────────────────────────────>  │
     │                        │                          │
     │                        │ 2. Validate RT1          │
     │                        │    Check not revoked      │
     │                        │    Check not used         │
     │                        │    If used → REVOKE FAMILY│
     │                        │    Generate RT2 (new)     │
     │                        │    Hash RT2, store        │
     │                        │    Mark RT1 as used       │
     │                        │    Generate new AT        │
     │                        │ ──────────────────────>  │
     │                        │ <──────────────────────  │
     │                        │                          │
     │ 3. {access_token,       │                          │
     │    refresh_token=RT2}   │                          │
     │ <────────────────────────────────────────────────  │
     │                        │                          │
```

**Detección de token theft:**
- Si RT1 ya fue usado (está en DB con `used_at` set) → significa que alguien más lo usó
- Revocar TODOS los tokens de la familia (mismo `family_id`)
- El usuario legítimo recibirá error al intentar usar RT2 → deberá re-login

## Google OAuth como IdP

```
─────────┐              ┌──────────┐               ┌──────────┐
│  SPA    │              │  API     │               │  Google  │
└────┬────┘              └────┬─────┘               └────┬─────┘
     │                        │                          │
     │ 1. GET /oauth2/authorize                        │
     │    ...&provider=google                           │
     │ ──────────────────────────────────────────────>  │
     │                        │                          │
     │                        │ 2. Generate state+nonce  │
     │                        │    Build Google URL       │
     │                        │ ─────────────────────>  │
     │                        │                          │
     │ 3. 302 redirect        │                          │
     │    to Google            │                          │
     │ <────────────────────────────────────────────────  │
     │                        │                          │
     │                        │ ───────> Google login ─>│
     │                        │ <─────── Google code <───│
     │                        │                          │
     │ 4. GET /oauth2/callback/google                    │
     │    code=google_code                               │
     │    state=xyz                                      │
     │ ──────────────────────────────────────────────>  │
     │                        │                          │
     │                        │ 5. Exchange Google code  │
     │                        │    for user info          │
     │                        │ ──────────────────────>  │
     │                        │ <──────────────────────  │
     │                        │                          │
     │                        │ 6. Find/create local user│
     │                        │    Complete registration  │
     │                        │    if needed              │
     │                        │ ──────────────────────>  │
     │                        │ <──────────────────────  │
     │                        │                          │
     │                        │ 7. Generate auth code    │
     │                        │    (LCDPC OAuth 2.0)      │
     │                        │ ──────────────────────>  │
     │                        │ <──────────────────────  │
     │                        │                          │
     │ 8. 302 redirect        │                          │
     │    to SPA with code     │                          │
     │ <────────────────────────────────────────────────  │
     │                        │                          │
     │ 9. POST /oauth2/token  │                          │
     │    (same flow as #5)    │                          │
     │ ──────────────────────────────────────────────>  │
     │                        │                          │
```

## Estructura de carpetas

```
LCDPC.API/
── Controllers/
│   ├── OAuth2Controller.cs        (nuevo)
│   ├── DiscoveryController.cs     (nuevo)
│   ── AuthController.cs          (modificado: compatibility layer)
├── Security/
│   ├── OAuth2JwtBearerEvents.cs   (nuevo: JWKS validation)
│   ├── AccessTokenResolver.cs     (modificado)
│   └── RequireRolesFilter.cs      (sin cambios)

LCDPC.Application/
└── OAuth2/
    ├── Contracts.cs               (nuevo: DTOs)
    ├── IOAuth2AuthorizationService.cs
    ├── IOAuth2TokenService.cs
    ├── IOAuth2KeyService.cs
    ├── IOAuth2ClientService.cs
    └── IGoogleOAuthService.cs

LCDPC.Infrastructure/
├── OAuth2/
│   ├── OAuth2AuthorizationService.cs
│   ├── OAuth2TokenService.cs
│   ├── RsaKeyService.cs
│   ├── OAuth2ClientService.cs
│   ├── GoogleOAuthService.cs
│   └── Repositories/
│       ├── OAuth2ClientRepository.cs
│       ├── OAuth2CodeRepository.cs
│       ── OAuth2RefreshTokenRepository.cs
└── Persistence/
    └── AppDbContext.cs            (modificado: nuevas tablas)

LCDPC.Domain/
└── Entities/OAuth2/
    ├── OAuth2Client.cs
    ├── OAuth2AuthorizationCode.cs
    └── OAuth2RefreshToken.cs
```

## Configuración

Nuevas secciones en `appsettings.json` / `.env`:

```json
{
  "OAuth2": {
    "Issuer": "http://localhost:8080",
    "Audience": "lcdpc-api",
    "AccessTokenTtlMinutes": 60,
    "RefreshTokenTtlDays": 30,
    "AuthorizationCodeTtlMinutes": 10,
    "RsaKeyPath": null,
    "Clients": [
      {
        "ClientId": "lcdpc-web",
        "ClientName": "LCDPC Web SPA",
        "RedirectUris": ["http://localhost:4200", "http://localhost:4200/auth/callback"],
        "GrantTypes": ["authorization_code", "refresh_token"],
        "RequirePkce": true,
        "AllowedScopes": "openid email profile admin admin:sedes admin:users"
      }
    ]
  },
  "GoogleOAuth": {
    "ClientId": "...",
    "ClientSecret": "...",
    "RedirectUri": "http://localhost:8080/oauth2/callback/google"
  }
}
```

## Compatibilidad con endpoints existentes

| Endpoint actual | Mapeo OAuth 2.0 | Estado |
|-----------------|-----------------|--------|
| `POST /api/v1/auth/login` | Internamente genera auth code → token exchange | Deprecated |
| `POST /api/v1/auth/register/start` | Sin cambios (pre-auth) | Activo |
| `POST /api/v1/auth/register/verify-email` | Sin cambios (pre-auth) | Activo |
| `POST /api/v1/auth/register/profile` | Sin cambios (pre-auth) | Activo |
| `GET /api/v1/auth/register/google` | Mapea a authorize con provider=google | Deprecated |
| `GET /api/v1/auth/register/google/callback` | Mapea a callback de Google IdP | Deprecated |
| `GET /api/v1/auth/me` | Usa nuevo validador JWT RS256 | Activo (adaptado) |
| `POST /api/v1/auth/refresh` | Mapea a `POST /oauth2/token` refresh_token grant | Deprecated |
| `POST /api/v1/auth/logout` | Mapea a `POST /oauth2/revoke` | Deprecated |
| `POST /api/v1/auth/forgot-password` | Sin cambios | Activo |
| `POST /api/v1/auth/reset-password` | Sin cambios | Activo |

## Testing strategy

- Tests unitarios para cada servicio OAuth 2.0
- Tests de integración para el flujo completo (authorize → token → introspect → revoke)
- Tests de PKCE (S256 validation)
- Tests de refresh token rotation y family revocation
- Tests de JWKS endpoint
- Tests de Google OAuth integration (mock de Google responses)
- Tests de compatibilidad con endpoints `/api/v1/auth/*`
- Tests de seguridad: code reuse, PKCE mismatch, token theft detection
