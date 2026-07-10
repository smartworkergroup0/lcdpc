# Domain Model: Usuarios y Administradores

## Objetivo

Definir el modelo de dominio para identidad, sesión, autorización por rol/sede y auditoría administrativa.

## Bounded Contexts involucrados

- `IdentityContext`
- `AccessControlContext`
- `SessionContext`
- `AuditContext`

## Entidades

### Usuario

- `usuarioId: UUID`
- `nombreCompleto: string`
- `telefono: string`
- `email?: string`
- `estado: enum { activo, suspendido, desactivado }`
- `tipoCuenta: enum { cliente, administrador }`
- `estadoOnboarding: enum { pendiente_verificacion, pendiente_perfil, activo }`
- `authProvider: enum { local, google }`
- `passwordHash?: string`
- `mfaEnabled: boolean`
- `createdAt: DateTime`
- `updatedAt: DateTime`
- `correoAfiliadoVerificado: boolean`
- `emailVerifiedAtUtc?: DateTime`
- `onboardingStatus: enum { pending_verification, pending_profile, active }`

### Rol

- `rolId: UUID`
- `codigo: enum { cliente, admin_sede, admin_global }`
- `nombre: string`
- `descripcion: string`
- `scope: enum { self, sede, global }`

### AsignacionRol

- `asignacionRolId: UUID`
- `usuarioId: UUID`
- `rolId: UUID`
- `sedeIds: UUID[]` (vacío para `admin_global` o `cliente`)
- `activo: boolean`
- `createdAt: DateTime`

### Sesion

- `sesionId: UUID`
- `usuarioId: UUID`
- `refreshTokenHash: string`
- `ip: string`
- `userAgent: string`
- `estado: enum { activa, revocada, expirada }`
- `issuedAt: DateTime`
- `expiresAt: DateTime`
- `revokedAt?: DateTime`

### VerificacionCorreo

- `verificacionCorreoId: UUID`
- `usuarioId: UUID`
- `email: string`
- `otpHash: string`
- `expiresAt: DateTime`
- `verifiedAt?: DateTime`
- `intentos: number`
- `maxIntentos: number` (v1: `5`)
- `bloqueadoHasta?: DateTime`

### PasswordReset

- `passwordResetId: UUID`
- `usuarioId: UUID`
- `tokenHash: string`
- `expiresAt: DateTime`
- `usedAt?: DateTime`
- `configVersion: number`

### PoliticaSeguridadAuth

- `politicaId: UUID`
- `otpTtlMinutes: number` (v1: `10`)
- `otpMaxIntentos: number` (v1: `5`)
- `otpCooldownMinutes: number` (v1: `10`)
- `resetTokenTtlMinutes: number` (configurable)
- `revokeSessionsOnReset: boolean` (configurable)
- `editableByRoles: string[]`

### Auditoria

- `auditoriaId: UUID`
- `actorUsuarioId: UUID`
- `actorRol: string`
- `accion: string`
- `recursoTipo: string`
- `recursoId: string`
- `sedeId?: UUID`
- `payloadResumen: object`
- `timestamp: DateTime`

## Value Objects

### Credencial

- `identifier: string` (telefono o email)
- `secret: string` (contraseña u OTP)

### TokenPair

- `accessToken: string`
- `refreshToken: string`
- `expiresInSeconds: number`

### UserSummary

- `usuarioId: UUID`
- `email: string`
- `displayName: string`
- `estado: string`
- `tipoCuenta: string`
- `onboardingStatus: string`
- `emailVerifiedAtUtc?: DateTime`
- `roles: string[]`

### ResourcePermission

- `resourceCode: string`
- `canView: boolean`
- `canWrite: boolean`
- `canUpdate: boolean`
- `canDelete: boolean`
- `canAll: boolean`

### PerfilMinimoRegistro

- `nombres: string`
- `apellidos: string`
- `documentoIdentidad: string`
- `telefonoWhatsApp: string`
- `direccionCompleta: string`

### GooglePrefill

- `email?: string`
- `emailVerified?: boolean`
- `name?: string`
- `givenName?: string`
- `familyName?: string`
- `picture?: string`
- `locale?: string`

### ScopeAcceso

- `scope: enum { self, sede, global }`
- `sedeIds: UUID[]`

## Agregados

### Agregado `UsuarioAcceso`

- Raíz: `Usuario`
- Contiene: `AsignacionRol[]`
- Invariantes:
  - Usuario `desactivado` no puede autenticarse.
  - `admin_sede` debe tener al menos una sede asignada.
  - `cliente` no puede tener permisos administrativos.
  - Usuario `cliente` solo puede operar comercialmente cuando `estadoOnboarding = activo`.
  - Si `authProvider = google`, `passwordHash` puede ser nulo.

### Agregado `Sesion`

- Raíz: `Sesion`
- Invariantes:
  - Una sesión revocada no puede renovarse.
  - Renovación requiere `refreshTokenHash` válido y sesión `activa`.

### Agregado `RecuperacionCredencial`

- Raíz: `PasswordReset`
- Invariantes:
  - Token de recuperación tiene un solo uso.
  - Token vencido no permite cambio de contraseña.
  - Para `cliente`, se emite a correo afiliado verificado.
  - Para `administrador`, solo puede ser emitido por `admin_global` desde módulo de refrescamiento.

### Agregado `Auditoria`

- Raíz: `Auditoria`
- Invariantes:
  - Toda acción administrativa crítica genera registro obligatorio.
  - El evento debe incluir actor, recurso y timestamp.

## Servicios de dominio

### AuthService

- autentica usuario por credencial
- emite `TokenPair`
- revoca sesiones
- renueva tokens
- inicia registro por pasos
- valida OTP de correo
- completa onboarding de perfil
- inicia y confirma recuperación de contraseña
- autentica con Google OAuth
- aplica política OTP (`5` intentos, TTL `10` min, cooldown `10` min)
- aplica política configurable de reset token

### AuthorizationService

- evalúa permisos por rol
- evalúa alcance por sede
- resuelve `allow/deny` con motivo
- evalúa permisos de acceso al módulo de refrescamiento de admins

### AuditService

- registra eventos de seguridad
- registra operaciones administrativas en inventario/precios/combos/usuarios

## Matriz de permisos por rol/sede (v1)

| Capacidad | cliente | admin_sede | admin_global |
|---|---|---|---|
| Ver catálogo/búsqueda | ✅ | ✅ | ✅ |
| Gestionar carrito/checkout | ✅ | ✅ (si usa flujo cliente) | ✅ (si usa flujo cliente) |
| Ver panel admin | ❌ | ✅ (solo sedes asignadas) | ✅ (todas las sedes) |
| Gestionar inventario | ❌ | ✅ (solo sedes asignadas) | ✅ |
| Gestionar precios | ❌ | ✅ (solo sedes asignadas) | ✅ |
| Gestionar combos | ❌ | ✅ (solo sedes asignadas) | ✅ |
| Gestionar usuarios admin | ❌ | ❌ | ✅ |
| Ver auditoría | ❌ | ✅ (solo sedes asignadas) | ✅ |

## Reglas de autorización

1. Si rol = `admin_sede`, toda operación administrativa exige `sedeId` y pertenencia a `sedeIds`.
2. Si rol = `admin_global`, no hay restricción por sede.
3. Si rol = `cliente`, cualquier endpoint `/admin/*` debe responder `403`.
4. Usuario `suspendido` o `desactivado` recibe `401/403` según contexto.
5. Usuario con onboarding incompleto no puede confirmar pedido ni operar checkout.

## Reglas de onboarding y recuperación

1. Registro cliente requiere secuencia: verificar correo -> completar perfil mínimo -> confirmar alta.
2. Registro con Google puede omitir paso de contraseña local, pero no omite datos obligatorios del perfil mínimo.
3. OTP: máximo 5 intentos dentro de 10 minutos; al agotarse, nueva OTP solo después de 10 minutos.
4. Recuperación de cliente siempre se envía al correo afiliado.
5. Recuperación de admin requiere acción de `admin_global` desde módulo administrativo de refrescamiento.
6. TTL de reset token y política de revocación de sesiones se define en `PoliticaSeguridadAuth`.
7. OTP solo habilita transición de paso 2 a paso 3; no se usa como credencial de sesión.

## Estrategia de sesión web (v1 → OAuth 2.0)

1. Web mantiene sesión mediante **OAuth 2.0 Authorization Code Flow con PKCE**.
2. Access token (JWT RS256) almacenado en memoria; refresh token (opaco) en cookie `httpOnly` (`lcdpc_rt`).
3. Frontend no lee tokens para pintar UI; hidrata estado desde `GET /auth/me`.
4. `UserSummary + permissions` es la fuente de verdad para menú y guardas.
5. Backend mantiene autorización real por permisos de recurso, independiente del cliente.
6. **Discovery**: `GET /.well-known/openid-configuration` expone metadata OAuth 2.0.
7. **JWKS**: `GET /.well-known/jwks.json` expone clave pública RSA para validar access tokens.
8. **Introspection**: `POST /oauth2/introspect` para validar estado de tokens.
9. **Revocation**: `POST /oauth2/revoke` para cerrar sesión y revocar familia de refresh tokens.

## Patrón Front (guardas/menú)

1. Guardas de ruta verifican `permissions[*].canView` del recurso requerido.
2. Menú dinámico se renderiza solo con recursos visibles por permiso.
3. Acciones de botón usan permisos finos (`canWrite`, `canUpdate`, `canDelete`, `canAll`).
4. Si `onboardingStatus != active`, bloquear módulos comerciales y redirigir al flujo pendiente.

## Eventos de dominio (propuestos)

- `UsuarioRegistrado`
- `CorreoVerificacionSolicitado`
- `CorreoVerificado`
- `PerfilRegistroCompletado`
- `UsuarioAutenticado`
- `UsuarioAutenticadoConGoogle`
- `GooglePrefillObtenido`
- `SesionCreada`
- `SesionRenovada`
- `SesionRevocada`
- `OtpIntentosAgotados`
- `PasswordResetSolicitado`
- `PasswordResetCompletado`
- `AdminPasswordResetForzado`
- `PoliticaSeguridadAuthActualizada`
- `RolAsignado`
- `RolRemovido`
- `UsuarioDesactivado`
- `EventoAuditado`

## Contratos de aplicación (v1)

- `RegistrarCliente(nombre, telefono, email?)`
- `IniciarRegistroCliente(email)`
- `VerificarCorreoRegistro(email, otp)`
- `CompletarPerfilRegistro(usuarioId, perfilMinimo)`
- `IniciarSesion(identifier, secret)`
- `IniciarSesionGoogle(googleAuthCode)`
- `SolicitarRecuperacionPassword(identifier)`
- `ConfirmarRecuperacionPassword(token, nuevaPassword)`
- `SolicitarRecuperacionAdmin(adminUsuarioId, actorAdminGlobalId)`
- `ActualizarPoliticaSeguridadAuth(config)`
- `RenovarSesion(refreshToken)`
- `CerrarSesion(sesionId)`
- `AsignarRol(usuarioId, rolCodigo, sedeIds?)`
- `DesactivarUsuario(usuarioId)`
- `ListarEventosAuditoria(filtros)`
