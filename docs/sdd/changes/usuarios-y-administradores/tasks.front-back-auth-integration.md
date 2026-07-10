# Tasks Front-Back Auth Integration: Login + Registro

> Objetivo: cerrar la integración end-to-end entre frontend Angular y backend para login y registro de usuarios, manteniendo compatibilidad actual con `/api/v1/auth/*` durante la transición.

## Fase I1 - Base técnica compartida

- [ ] Definir `API_BASE_URL` único para frontend (dev/staging/prod) y documentar override en runtime.
- [ ] Confirmar CORS backend para `http://localhost:4200` con `AllowCredentials`.
- [ ] Confirmar política de cookies (`lcdpc_rt`, `lcdpc_at`) y su comportamiento en local/dev.
- [ ] Documentar contrato mínimo de errores para auth UI (`INVALID_CREDENTIALS`, `INVALID_SESSION`, `ONBOARDING_INCOMPLETE`, `USER_NOT_ALLOWED`).

## Fase I2 - Login end-to-end

- [x] Implementar cliente frontend para `POST /api/v1/auth/login`.
- [x] Implementar cliente frontend para `GET /api/v1/auth/me`.
- [x] Implementar cliente frontend para `POST /api/v1/auth/refresh`.
- [x] Implementar cliente frontend para `POST /api/v1/auth/logout`.
- [x] Conectar pantalla de login al backend con loading + manejo de errores.
- [ ] Implementar bootstrap de sesión al iniciar app (`me` + fallback a `refresh`).
- [ ] Implementar logout global (limpieza store + redirect + invalidación backend).
- [ ] Agregar interceptor/estrategia para retry con refresh cuando expire sesión.

## Fase I3 - Registro por pasos end-to-end

- [x] Integrar paso 1: `POST /api/v1/auth/register/start` (email + emisión OTP).
- [x] Integrar paso 2: `POST /api/v1/auth/register/verify-email` (validación OTP).
- [x] Integrar paso 3: `POST /api/v1/auth/register/profile` (alta de perfil + password).
- [x] Mapear validaciones backend en UI (email duplicado, OTP inválido/expirado, estado de flujo inválido).
- [x] Persistir `flowId` en estado del wizard de registro.
- [x] Añadir reset/reintento de flujo de registro ante errores recuperables.
- [x] Garantizar un único `registration_flows` por correo normalizado y reutilizar el mismo flujo ante reenvíos OTP.
- [x] Bloquear bypass de cooldown OTP con código estable `OTP_COOLDOWN_ACTIVE`.

## Fase I4 - Registro con Google

- [ ] Implementar CTA “Continuar con Google” → `GET /api/v1/auth/register/google`.
- [ ] Implementar handler de callback frontend para `GET /api/v1/auth/register/google/callback`.
- [ ] Aplicar prefill de formulario con `prefill` (`email`, `name`, `givenName`, `familyName`, `picture`, `locale`).
- [ ] Definir fallback UX cuando Google OAuth no esté configurado (`GOOGLE_OAUTH_NOT_CONFIGURED`).

## Fase I5 - Sesión, permisos y navegación protegida

- [ ] Crear/ajustar store de sesión (`authenticated`, `userSummary`, `permissions`, `expiresInSeconds`, `scopes`).
- [ ] Implementar guards por autenticación y permisos (`canView`, `canWrite`, `canUpdate`, `canDelete`, `canAll`).
- [ ] Implementar pantalla/estado `403 Forbidden` reusable.
- [ ] Bloquear acciones UI cuando backend responda `USER_NOT_ALLOWED`.

## Fase I6 - Pruebas front-back y calidad

- [x] Tests unitarios frontend del cliente auth (`login/me/refresh/logout`).
- [x] Test backend de compatibilidad para admin inicial seed + login.
- [ ] E2E happy path login: login -> me -> refresh -> logout.
- [ ] E2E happy path registro: start -> verify-email -> profile.
- [ ] E2E Google registro (si credenciales están disponibles en entorno de prueba).
- [ ] E2E negativos: credenciales inválidas, OTP inválido, sesión expirada.
- [ ] Definir fixture de usuario admin inicial para smoke tests de integración.

## Fase I7 - Cierre de transición OAuth2

- [ ] Verificar que frontend ya no dependa de lógica legacy fuera de la capa de compatibilidad definida.
- [ ] Confirmar criterios para retirar código dead del sistema de tokens antiguo.
- [ ] Actualizar `docs/sdd/changes/oauth2-estandarizacion/tasks.md` cuando se cumpla el criterio de limpieza final.

## Convención de mantenimiento

- [ ] Marcar checkboxes al finalizar cada tarea y referenciar PR/commit asociado.
- [ ] Mantener este archivo como fuente de verdad para integración auth front-back.
