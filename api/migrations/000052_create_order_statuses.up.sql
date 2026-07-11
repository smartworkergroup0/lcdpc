CREATE TABLE order_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL UNIQUE,
    label VARCHAR(200) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT '#6366f1',
    is_initial BOOLEAN NOT NULL DEFAULT false,
    is_final BOOLEAN NOT NULL DEFAULT false,
    description TEXT NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_statuses_code ON order_statuses(code);
CREATE INDEX idx_order_statuses_sort ON order_statuses(sort_order);

INSERT INTO order_statuses (code, label, color, is_initial, is_final, description, sort_order) VALUES
    ('PENDING_REVIEW',            'Pendiente de revisión',         '#f5cb00', true,  false, 'Orden creada, esperando revisión',                    1),
    ('UNDER_REVIEW',              'En revisión',                   '#f59e0b', false, false, 'Orden en proceso de revisión',                         2),
    ('APPROVED_FOR_FULFILLMENT',  'Aprobado para preparación',     '#3b82f6', false, false, 'Orden aprobada para preparación',                      3),
    ('REJECTED_BY_VALIDATION',    'Rechazado',                     '#ef4444', false, true,  'Orden rechazada durante validación',                   4),
    ('IN_PREPARATION',            'En preparación',                '#8b5cf6', false, false, 'Orden en proceso de preparación',                      5),
    ('AWAITING_INVENTORY',        'Esperando inventario',          '#f97316', false, false, 'Esperando disponibilidad de inventario',               6),
    ('PREPARATION_COMPLETED',     'Preparación completada',        '#06b6d4', false, false, 'Preparación de la orden finalizada',                   7),
    ('READY_FOR_PICKUP',          'Listo para recoger',            '#22c55e', false, false, 'Orden lista para retiro en tienda',                    8),
    ('READY_FOR_DISPATCH',        'Listo para despacho',           '#22c55e', false, false, 'Orden lista para despacho a domicilio',                9),
    ('IN_TRANSIT',                'En tránsito',                   '#3b82f6', false, false, 'Orden en camino al cliente',                          10),
    ('DELIVERED',                 'Entregado',                     '#10b981', false, false, 'Orden entregada al cliente',                          11),
    ('PICKED_UP',                 'Recogido',                      '#10b981', false, false, 'Orden recogida por el cliente',                       12),
    ('DELIVERY_FAILED',           'Falló la entrega',              '#ef4444', false, true,  'Intento de entrega fallido',                          13),
    ('COMPLETED',                 'Completado',                    '#22c55e', false, true,  'Orden completada exitosamente',                       14),
    ('CANCELLED_BY_CUSTOMER',     'Cancelado por el cliente',      '#6b7280', false, true,  'Orden cancelada por el cliente',                      15);
