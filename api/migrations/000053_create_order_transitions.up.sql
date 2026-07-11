CREATE TABLE order_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_status_id UUID NOT NULL REFERENCES order_statuses(id) ON DELETE CASCADE,
    target_status_id UUID NOT NULL REFERENCES order_statuses(id) ON DELETE CASCADE,
    label VARCHAR(200) NOT NULL DEFAULT '',
    code VARCHAR(200) NOT NULL UNIQUE,
    trigger_type VARCHAR(20) NOT NULL DEFAULT 'manual',
    required_roles JSONB NOT NULL DEFAULT '[]',
    conditions JSONB NOT NULL DEFAULT '[]',
    actions JSONB NOT NULL DEFAULT '[]',
    sort_order INT NOT NULL DEFAULT 0,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(source_status_id, target_status_id)
);

CREATE INDEX idx_order_transitions_source ON order_transitions(source_status_id);
CREATE INDEX idx_order_transitions_target ON order_transitions(target_status_id);
CREATE INDEX idx_order_transitions_code ON order_transitions(code);

DO $$
DECLARE
    v_pending      UUID;
    v_under        UUID;
    v_approved     UUID;
    v_rejected     UUID;
    v_preparation  UUID;
    v_awaiting     UUID;
    v_prep_done    UUID;
    v_ready_pick   UUID;
    v_ready_disp   UUID;
    v_transit      UUID;
    v_delivered    UUID;
    v_picked       UUID;
    v_fail         UUID;
    v_completed    UUID;
    v_cancelled    UUID;
BEGIN
    SELECT id INTO v_pending     FROM order_statuses WHERE code = 'PENDING_REVIEW';
    SELECT id INTO v_under       FROM order_statuses WHERE code = 'UNDER_REVIEW';
    SELECT id INTO v_approved    FROM order_statuses WHERE code = 'APPROVED_FOR_FULFILLMENT';
    SELECT id INTO v_rejected    FROM order_statuses WHERE code = 'REJECTED_BY_VALIDATION';
    SELECT id INTO v_preparation FROM order_statuses WHERE code = 'IN_PREPARATION';
    SELECT id INTO v_awaiting    FROM order_statuses WHERE code = 'AWAITING_INVENTORY';
    SELECT id INTO v_prep_done   FROM order_statuses WHERE code = 'PREPARATION_COMPLETED';
    SELECT id INTO v_ready_pick  FROM order_statuses WHERE code = 'READY_FOR_PICKUP';
    SELECT id INTO v_ready_disp  FROM order_statuses WHERE code = 'READY_FOR_DISPATCH';
    SELECT id INTO v_transit     FROM order_statuses WHERE code = 'IN_TRANSIT';
    SELECT id INTO v_delivered   FROM order_statuses WHERE code = 'DELIVERED';
    SELECT id INTO v_picked      FROM order_statuses WHERE code = 'PICKED_UP';
    SELECT id INTO v_fail        FROM order_statuses WHERE code = 'DELIVERY_FAILED';
    SELECT id INTO v_completed   FROM order_statuses WHERE code = 'COMPLETED';
    SELECT id INTO v_cancelled   FROM order_statuses WHERE code = 'CANCELLED_BY_CUSTOMER';

    INSERT INTO order_transitions (source_status_id, target_status_id, label, code, trigger_type, sort_order) VALUES
        (v_pending,     v_under,       'Revisar',           'pending_to_under_review',       'manual', 1),
        (v_pending,     v_rejected,    'Rechazar',          'pending_to_rejected',           'manual', 2),
        (v_pending,     v_cancelled,   'Cancelar',          'pending_to_cancelled',          'manual', 3),
        (v_under,       v_approved,    'Aprobar',           'under_to_approved',             'manual', 1),
        (v_under,       v_rejected,    'Rechazar',          'under_to_rejected',             'manual', 2),
        (v_under,       v_cancelled,   'Cancelar',          'under_to_cancelled',            'manual', 3),
        (v_approved,    v_preparation, 'Iniciar preparación','approved_to_preparation',       'manual', 1),
        (v_approved,    v_cancelled,   'Cancelar',          'approved_to_cancelled',         'manual', 2),
        (v_preparation, v_awaiting,    'Esperar inventario','preparation_to_awaiting',       'manual', 1),
        (v_preparation, v_prep_done,   'Completar prep.',   'preparation_to_done',           'manual', 2),
        (v_preparation, v_cancelled,   'Cancelar',          'preparation_to_cancelled',      'manual', 3),
        (v_awaiting,    v_preparation, 'Reanudar',          'awaiting_to_preparation',       'manual', 1),
        (v_awaiting,    v_cancelled,   'Cancelar',          'awaiting_to_cancelled',         'manual', 2),
        (v_prep_done,   v_ready_pick,  'Listo para recoger','prep_done_to_ready_pickup',     'manual', 1),
        (v_prep_done,   v_ready_disp,  'Listo para despacho','prep_done_to_ready_dispatch',  'manual', 2),
        (v_ready_pick,  v_picked,      'Marcar recogido',   'ready_pickup_to_picked',        'manual', 1),
        (v_ready_pick,  v_fail,        'Falló entrega',     'ready_pickup_to_fail',          'manual', 2),
        (v_ready_disp,  v_transit,     'En tránsito',       'ready_dispatch_to_transit',     'manual', 1),
        (v_ready_disp,  v_fail,        'Falló entrega',     'ready_dispatch_to_fail',        'manual', 2),
        (v_transit,     v_delivered,   'Entregar',          'transit_to_delivered',          'manual', 1),
        (v_transit,     v_fail,        'Falló entrega',     'transit_to_fail',               'manual', 2),
        (v_delivered,   v_completed,   'Completar',         'delivered_to_completed',        'manual', 1),
        (v_picked,      v_completed,   'Completar',         'picked_to_completed',           'manual', 1);
END $$;
