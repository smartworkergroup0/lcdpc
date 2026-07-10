# SDD - La Casa del Perrocalentero Web

Este directorio guarda artefactos de especificación (Spec-Driven Development) para alinear negocio, diseño e implementación.

## Cambios activos

- `changes/pricing-sedes-y-mayor-detal/` — Precios por sede, restricción de carrito, niveles de precio mayor/detal
- `changes/usuarios-y-administradores/` — Autenticación, autorización, gestión de usuarios/roles (RBAC)
	- `tasks.front-back-auth-integration.md` — Plan operativo de integración login + registro front-back
- `changes/oauth2-estandarizacion/` — Migrar autenticación a OAuth 2.0 estándar (RFC 6749) con PKCE, refresh token rotation, introspection, revocation

## Objetivo

Definir reglas claras para:

- Precio referencial en catálogo versus precio definitivo por sede.
- Restricción de sede única en carrito.
- Estrategia de precios mayor/detal con 4 niveles administrativos.
- Tipificación de productos por unidad de medida y unidad comercial.
- Módulo administrativo de combos con precio total y precio promocional editable.
- Autenticación OAuth 2.0 estandarizada con PKCE y refresh token rotation.
