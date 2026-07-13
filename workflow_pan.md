# Plan: Editor de Flujos Basado en Nodos (Workflow Editor)

## Objetivo

Construir un editor visual de flujos (node-based UI) inspirado en n8n para gestionar el ciclo de vida de órdenes. El usuario puede arrastrar nodos (estatus), conectarlos con flechas (transiciones), y configurar reglas por transición.

## Stack

- **Frontend**: Angular 20 + PrimeNG 20 + pnpm + SCSS
- **Librería de nodos**: `@xyflow/angular` (wrapper oficial de xyflow/React Flow para Angular)
- **Backend**: Go + PostgreSQL + pgx

## Librería seleccionada: @xyflow/angular

- Repo: `xyflow/xyflow` (30k+ stars, MIT)
- Paquete Angular oficial: `@xyflow/angular`
- Modelo de datos: arrays planos de `nodes` y `edges` → mapea 1:1 con nuestro JSON schema
- Soporta: drag & drop, zoom/pan, custom node types, edge labels, minimap, controles, snap-to-grid, serialización directa
- Instalación: `pnpm add @xyflow/angular`

## Centralización de Estatus vía API

**Punto clave**: Los estatus de órdenes NO se hardcodean en el frontend. Se cargan desde un endpoint del backend.

- **Endpoint**: `GET /api/v1/order-statuses` → devuelve la lista de estatus disponibles con su metadata (label, code, color, is_initial, is_final, description)
- **Endpoint**: `GET /api/v1/order-transitions` → devuelve las transiciones válidas entre estatus (source, target, label, rules)
- El editor carga estos datos al abrir y los usa como nodos/edges iniciales
- Si en el futuro se agregan, eliminan o modifican estatus, solo se cambia el backend (BD o config) y el frontend se actualiza automáticamente
- El `allowedTransitions` hardcodeado en `api/internal/order/statuses.go` se migra a tabla `order_statuses` + `order_transitions` en PostgreSQL
- Fallback: si el endpoint falla, el editor muestra un estado vacío con opción de crear nodos desde cero

## JSON Schema de salida

```json
{
  "workflow_id": "wf_98765",
  "name": "Flujo Estándar de Órdenes",
  "version": "1.0",
  "description": "Flujo principal para órdenes de venta",
  "entity_type": "order",
  "nodes": [
    {
      "id": "node_1",
      "type": "status",
      "position": { "x": 100, "y": 200 },
      "data": {
        "label": "Pendiente",
        "code": "PENDING_REVIEW",
        "is_initial": true,
        "is_final": false,
        "color": "#f5cb00",
        "description": "Orden creada, esperando revisión"
      }
    },
    {
      "id": "node_2",
      "type": "status",
      "position": { "x": 400, "y": 200 },
      "data": {
        "label": "Pagado",
        "code": "PAID",
        "is_initial": false,
        "is_final": false,
        "color": "#22c55e"
      }
    }
  ],
  "edges": [
    {
      "id": "edge_1_to_2",
      "source": "node_1",
      "target": "node_2",
      "data": {
        "label": "Aprobar Pago",
        "code": "approve_payment",
        "rules": {
          "trigger_type": "manual",
          "required_roles": ["admin", "cajero"],
          "conditions": [
            {
              "field": "monto_pagado",
              "operator": "greater_than_or_equal",
              "value": "monto_total_orden"
            }
          ]
        },
        "actions": [
          {
            "type": "send_email",
            "template_id": "tpl_pago_exitoso"
          },
          {
            "type": "webhook",
            "url": "https://api.tu-sistema.com/notify"
          }
        ]
      }
    }
  ],
  "metadata": {
    "viewport": { "x": 0, "y": 0, "zoom": 1 },
    "created_at": "2026-07-11T00:00:00Z",
    "updated_at": "2026-07-11T00:00:00Z"
  }
}
```

## Fases de desarrollo

### Fase 0: Fundación (1 día)
- Instalar `@xyflow/angular` con pnpm
- Crear la ruta `/admin/workflows` en `app.routes.ts`
- Crear estructura de carpetas:
  ```
  pages/admin/workflows/
    workflow-editor-page.component.ts
    workflow-editor-page.component.html
    workflow-editor-page.component.scss
    components/
      status-node/
        status-node.component.ts
      edge-config-panel/
        edge-config-panel.component.ts
      node-config-panel/
        node-config-panel.component.ts
  core/
    models/
      workflow.model.ts
    services/
      workflow-api.service.ts
  ```
- Definir interfaces TypeScript (`Workflow`, `WorkflowNode`, `WorkflowEdge`, etc.)
- Agregar permiso `workflow:view` al RBAC y al menú lateral del admin

### Fase 1: Canvas básico con nodos estáticos (2 días)
- Implementar `workflow-editor-page` con xyflow
- Crear `StatusNodeComponent` custom: nombre del estatus, `p-tag` de color, indicador inicial/final
- **Cargar estatus desde `GET /api/v1/order-statuses`** y renderizarlos como nodos
- **Cargar transiciones desde `GET /api/v1/order-transitions`** y renderizar edges
- Soporte básico: pan, zoom, arrastrar nodos

### Fase 2: Interactividad — Drag, Connect, Select (2 días)
- Drag & drop de nodos (reposicionar)
- Conexión entre nodos (arrastrar desde handle a handle)
- Click en edge → panel lateral de configuración de transición
- Click en nodo → panel lateral de configuración de estatus
- Botón "Agregar nodo" (drag al canvas)
- Botón "Eliminar" en nodo y edge (con confirmación)

### Fase 3: Panel de configuración de transición (2-3 días) ✅
- Panel lateral (`p-sidebar`) para configurar edge seleccionado:
  - Label, código único
  - Trigger type (manual, automático, webhook)
  - Roles requeridos (multi-select con roles del RBAC existente)
  - Condiciones (lista dinámica field/operator/value)
  - Acciones post-transición (send_email, webhook, update_field)
- Panel lateral para nodo: label, código, color, is_initial, is_final, descripción

### Fase 4: Serialización y persistencia (1-2 días) ✅
- `serialize()`: estado de xyflow → JSON schema
- Botón "Guardar" → POST/PUT al backend
- Cargar flujo existente desde backend → rehidratar canvas
- Validaciones pre-guardar:
  - Exactamente 1 nodo con `is_initial: true`
  - Al menos 1 nodo con `is_final: true`
  - Todos los nodos deben tener `code`
  - No edges huérfanos (source/target válido)

### Fase 5: Backend — Persistencia y centralización de estatus (2-3 días) ✅
- Migración: tabla `order_statuses` (id, code, label, color, is_initial, is_final, description, sort_order, created_at, updated_at)
- Migración: tabla `order_transitions` (id, source_status_id, target_status_id, label, code, trigger_type, required_roles JSONB, conditions JSONB, actions JSONB, sort_order, created_at, updated_at)
- Migración: tabla `workflows` (id, name, entity_type, version, definition JSONB, is_active, created_at, updated_at)
- Migración: tabla `workflow_versions` (id, workflow_id, version, definition JSONB, created_at)
- CRUD endpoints:
  - `GET /api/v1/order-statuses` — listar estatus disponibles
  - `GET /api/v1/order-transitions` — listar transiciones disponibles
  - `POST /api/v1/workflows` — crear flujo
  - `GET /api/v1/workflows/:id` — obtener flujo
  - `PUT /api/v1/workflows/:id` — actualizar flujo
  - `GET /api/v1/workflows` — listar flujos (con filtro por entity_type)
- Nuevo paquete `internal/workflow/` con service y queries
- Migrar `api/internal/order/statuses.go`: `allowedTransitions` se lee desde BD en vez de hardcode

### Fase 6: Integración con flujo de órdenes (1-2 días) ✅
- `order.ChangeStatus()` consulta workflow activo en vez del mapa hardcodeado
- Evaluar `rules.conditions` antes de permitir transición
- Ejecutar `rules.actions` después de transición exitosa (email, webhook)
- Mantener hardcode como fallback si no hay workflow configurado

### Fase 7: Polish y UX (1-2 días) ✅
- Auto-layout con `dagre` o `elkjs` para organizar nodos automáticamente
- Minimap en esquina del canvas
- Zoom controls
- Undo/Redo
- Exportar/importar JSON
- Responsive en pantallas pequeñas

## Esfuerzo estimado

| Fase | Días | Dependencias |
|------|------|-------------|
| 0 - Fundación | 1 | — |
| 1 - Canvas básico | 2 | Fase 0 |
| 2 - Interactividad | 2 | Fase 1 |
| 3 - Config panels | 3 | Fase 2 |
| 4 - Serialización | 2 | Fase 3 |
| 5 - Backend | 3 | Fase 4 |
| 6 - Integración órdenes | 2 | Fase 5 |
| 7 - Polish | 2 | Fase 6 |
| **Total** | **~17 días** | |
