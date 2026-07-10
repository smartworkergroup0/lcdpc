# Tasks: OAuth 2.0 Authorization Server

## Fase 1 - Infraestructura de datos y claves

- [x] Crear entidad de dominio `OAuth2Client` en `LCDPC.Domain/Entities/OAuth2/`
- [x] Crear entidad de dominio `OAuth2AuthorizationCode` en `LCDPC.Domain/Entities/OAuth2/`
- [x] Crear entidad de dominio `OAuth2RefreshToken` en `LCDPC.Domain/Entities/OAuth2/`
- [x] Agregar `DbSet<>` para las 3 nuevas tablas en `AppDbContext`
- [x] Ejecutar `Database.EnsureCreated()` para crear tablas (se usa EnsureCreated, no migrations)
- [x] Seed del cliente `lcdpc-web` en el startup (como se seedea el superuser)
- [x] Implementar `RsaKeyService` (IOAuth2KeyService): generación de par RSA, cacheo, exportación a JWKS format
- [x] Agregar sección `OAuth2` a `DependencyInjection.cs` con opciones de configuración

## Fase 2 - Servicios de Application Layer

- [x] Crear `IOAuth2ClientService` + implementación: validación de client_id, redirect_uri, scopes
- [x] Crear `IOAuth2TokenService` + implementación: generación de JWT RS256, refresh tokens opacos
- [x] Crear `IOAuth2AuthorizationService` + implementación: authorize flow, code exchange, refresh rotation
- [x] Implementar lógica de refresh token rotation con detección de familia (family_id)
- [x] Implementar detección de token theft (reutilización de refresh token consumido → revocar familia)
- [x] Crear `IGoogleOAuthService` + implementación: Google OAuth como IdP upstream
- [x] Crear Contracts (DTOs) para todos los request/response OAuth 2.0

## Fase 3 - Endpoints OAuth 2.0 (API Layer)

- [x] Crear `OAuth2Controller` con endpoint `GET /oauth2/authorize`
- [x] Crear `OAuth2Controller` con endpoint `POST /oauth2/token` (grant_type: authorization_code + refresh_token)
- [x] Crear `OAuth2Controller` con endpoint `POST /oauth2/introspect`
- [x] Crear `OAuth2Controller` con endpoint `POST /oauth2/revoke`
- [x] Crear `OAuth2Controller` con callback de Google `GET /oauth2/callback/google`
- [x] Crear `DiscoveryController` con `GET /.well-known/openid-configuration`
- [x] Crear `DiscoveryController` con `GET /.well-known/jwks.json`
- [x] Configurar rate limiting en `/oauth2/token` endpoint

## Fase 4 - Validación de tokens en middleware

- [x] Actualizar `JwtBearer` configuration para usar JWKS endpoint (RS256 validation)
- [x] Crear `OAuth2JwtBearerEvents` para token validation con JWKS
- [x] Actualizar `AccessTokenResolver` para el nuevo formato de tokens
- [x] Actualizar `RequireRolesFilter` para usar el nuevo sistema de validación
- [x] Actualizar `MeResponse` para incluir scopes OAuth 2.0

## Fase 5 - Compatibilidad con endpoints existentes

- [x] Adaptar `AuthController` `/api/v1/auth/login` para generar auth code → token exchange internamente
- [x] Adaptar `AuthController` `/api/v1/auth/refresh` → mapear a refresh_token grant
- [x] Adaptar `AuthController` `/api/v1/auth/logout` → mapear a revoke endpoint
- [x] Adaptar `AuthController` `/api/v1/auth/me` → usar nuevo validador JWT
- [x] Marcar endpoints deprecated con headers `Deprecation` + `Sunset`
- [x] Mantener registro endpoints `/api/v1/auth/register/*` sin cambios (pre-auth)

## Fase 6 - Configuración y seed

- [x] Agregar configuración OAuth2 a `.env.example`
- [x] Seed del cliente `lcdpc-web` en el bootstrap de la app
- [x] Generar par de claves RSA en startup (o cargar desde config)
- [x] Actualizar `docker-compose.yml` si es necesario (no debería necesitar cambios)

## Fase 7 - Tests

- [x] Tests unitarios para `OAuth2AuthorizationService` (authorize, exchange, refresh, revoke)
- [x] Tests unitarios para `OAuth2TokenService` (JWT RS256 generation, validation)
- [x] Tests unitarios para `RsaKeyService` (key generation, JWKS export)
- [x] Tests unitarios para refresh token rotation y family revocation
- [x] Tests de PKCE S256 validation (correcto e incorrecto)
- [x] Tests de integración: flujo completo authorize → token → introspect → revoke
- [x] Tests de integración: refresh token rotation con detección de theft
- [x] Tests de compatibilidad: endpoints `/api/v1/auth/*` siguen funcionando
- [x] Tests de seguridad: code reuse attack, PKCE mismatch, token family revocation

## Fase 8 - Documentación y limpieza

- [x] Actualizar `README.md` del proyecto con nueva info de OAuth 2.0
- [x] Actualizar spec de `usuarios-y-administradores` para reflejar el cambio de tokens
- [x] Agregar OpenAPI/Swagger docs para los nuevos endpoints OAuth 2.0
- [ ] Eliminar código dead del sistema de tokens antiguo (bloqueado hasta que frontend deje de depender de `/api/v1/auth/*` y `UserSessions`)

## Dependencias

- Fase 1 → Fase 2
- Fase 2 → Fase 3
- Fase 3 → Fase 4
- Fase 4 → Fase 5
- Fase 1-5 → Fase 6
- Fase 3-5 → Fase 7
- Fase 7 → Fase 8
