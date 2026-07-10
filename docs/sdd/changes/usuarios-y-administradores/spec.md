# Spec: Manejo de Usuarios y Administradores

## Estado

- Propuesto: 2026-05-16
- Prioridad: Alta

## Contexto

La plataforma tendrá dos perfiles principales:

- Clientes que navegan catálogo, gestionan carrito y confirman pedidos.
- Administradores que gestionan productos, inventario por sede, matriz de precios y combos.

## Problema

Sin una especificación de identidad y permisos:

- No se puede proteger operaciones administrativas.
- No se puede auditar quién cambió precios, stock o combos.
- Se mezclan flujos de cliente y administración.

## Objetivo

Definir autenticación, autorización y gestión de usuarios/roles para separar correctamente capacidades de cliente y administración.

## Roles iniciales (RBAC v1)

- `cliente`
- `admin_sede`
- `admin_global`

## Alcance funcional

### Registro e identidad

- Cliente puede registrarse con datos básicos (nombre, teléfono, email opcional).
- Cliente puede iniciar sesión por teléfono/email + OTP o contraseña (definir estrategia técnica en diseño).
- Flujo de creación de usuario cliente es guiado por pasos:
	- Paso 1: verificación de correo con código OTP.
	- Paso 2: formulario de datos mínimos de perfil/facturación.
	- Paso 3: confirmación de alta.
- La creación de usuario también puede iniciar con autenticación Google para prellenar datos mínimos del paso 2 (nombre y correo, y los campos disponibles por perfil).
- Admin se crea por backoffice (no auto-registro público).

### Gestión de sesión

- Iniciar sesión / cerrar sesión.
- Recuperar acceso.
- Mantener sesión segura con expiración configurable.
- **OAuth 2.0 Authorization Code Flow con PKCE** como modelo canónico para la web SPA.
- **Authorization Code** (opaco, TTL 10 min, PKCE S256 binding) emitido por `/oauth2/authorize`.
- **Access Token** (JWT RS256) intercambiado via `POST /oauth2/token`.
- **Refresh Token** (opaco, rotación obligatoria, detección de token theft via family_id).
- **Introspection** via `POST /oauth2/introspect` para validar tokens.
- **Revocation** via `POST /oauth2/revoke` para cerrar sesión.
- Durante la transición, los endpoints `/api/v1/auth/*` siguen funcionando como capa de compatibilidad para el frontend actual.
- El frontend objetivo mantiene access token en memoria y refresh token en cookie `httpOnly` (`lcdpc_rt`).
- Mientras exista la capa de compatibilidad, `/api/v1/auth/login`, `/api/v1/auth/refresh` y `/api/v1/auth/logout` siguen pudiendo emitir/rotar cookies `lcdpc_at` y `lcdpc_rt`.
- Frontend hidrata estado de sesión mediante `GET /auth/me` con `UserSummary + permissions`.
- Flujo de `olvido de contraseña` para clientes enviando enlace/código al correo afiliado de la cuenta.
- Para administradores, el reinicio de credenciales se gestiona desde módulo administrativo de refrescamiento de admins (no autoservicio directo).
- **Discovery endpoint** `GET /.well-known/openid-configuration` para metadata OAuth 2.0.
- **JWKS endpoint** `GET /.well-known/jwks.json` para validación de access tokens RS256.

### Autorización

- `cliente`: catálogo, búsqueda, carrito, confirmación de pedido.
- `admin_sede`: gestión de inventario/precios/combos de su(s) sede(s).
- `admin_global`: gestión total multi-sede + usuarios admin.

### Gestión de usuarios (admin)

- Listar usuarios.
- Activar/desactivar usuario.
- Asignar/cambiar roles.
- Asignar sedes permitidas a `admin_sede`.
- Acceder al módulo de refrescamiento de usuarios administradores según rol/permisos.
- Configurar políticas de seguridad de tokens de recuperación (TTL/revocación) desde dashboard administrativo.

## Reglas de dominio

- Todo cambio administrativo debe quedar auditado con `usuarioId`, fecha y sede afectada.
- `admin_sede` no puede operar fuera de sus sedes asignadas.
- `admin_global` puede operar en cualquier sede.
- Un usuario desactivado no puede autenticarse.
- El alta de cliente se considera completada solo al finalizar los 3 pasos del registro.
- Los usuarios autenticados por Google deben completar los datos obligatorios faltantes del paso 2 antes de activar su cuenta comercial.
- OTP de verificación de correo: TTL de 10 minutos y máximo 5 intentos.
- Si se consumen los 5 intentos OTP, el usuario debe esperar 10 minutos para solicitar una nueva OTP.
- Recuperación de clientes se envía al correo afiliado del cliente.
- Recuperación de admins se ejecuta por `admin_global` desde módulo de refrescamiento de admins.
- Duración y revocación de reset token es configurable desde módulo administrativo del dashboard.

## Criterios de aceptación

1. Usuario cliente autenticado puede operar carrito/checkout.
2. Usuario cliente no puede acceder a módulos de admin.
3. `admin_sede` solo ve y modifica recursos de sus sedes.
4. `admin_global` puede gestionar recursos de cualquier sede.
5. Cambios en precios, inventario y combos quedan auditados con actor y timestamp.
6. Admin puede crear/desactivar administradores y asignarles rol/sedes.
7. El flujo de registro por pasos valida correo por OTP antes de permitir completar perfil.
8. El registro con Google prellena datos del paso 2 y exige completar los campos obligatorios faltantes antes de confirmar alta.
9. El flujo de olvido de contraseña permite emitir token/código de recuperación, establecer nueva contraseña y revocar sesiones previas según política.
10. OTP expira a los 10 minutos y bloquea nuevas validaciones al superar 5 intentos, habilitando nueva solicitud solo tras 10 minutos.
11. Cliente recibe recuperación al correo afiliado; admin no usa recuperación autoservicio y depende de acción del super admin.
12. La política de reset token (TTL/revocación) se administra desde dashboard por roles autorizados.
13. Frontend no requiere exponer token ni `usuarioId` para construir sesión visual; usa `UserSummary + permissions` desde `/auth/me`.
14. Guardas y menú frontend se resuelven por permisos de recurso (`canView`, `canWrite`, `canUpdate`, `canDelete`, `canAll`).

## Casos borde

- Usuario con múltiples roles: aplicar rol más permisivo solo si política lo permite explícitamente.
- Admin con cero sedes asignadas: acceso administrativo bloqueado hasta asignación.
- Sesión expirada durante edición administrativa: guardar borrador local y solicitar reautenticación.
- Correo ya registrado durante alta por pasos: ofrecer inicio de sesión o recuperación de contraseña.
- Usuario que inicia con Google y no completa paso 2: cuenta en estado pendiente, sin acceso a checkout.
- Cliente sin correo afiliado válido: bloquear recuperación y derivar a soporte.
- Admin de sede intentando resetear otro admin sin permiso: rechazar con `403` y auditar evento.

## No funcionales

- Contraseñas cifradas con algoritmo robusto.
- Tokens con expiración, rotación y revocación por familia.
- Logs de seguridad para intentos fallidos y cambios de privilegios.
- Preparado para 2FA en roadmap.

## Artefactos de soporte SDD

- Modelo de dominio: `docs/sdd/changes/usuarios-y-administradores/domain-model.md`
- Contratos API (propuesta v1): `docs/sdd/changes/usuarios-y-administradores/api-contracts.md`
