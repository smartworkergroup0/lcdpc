-- Orders system

-- orders
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sede_id UUID NOT NULL REFERENCES sedes(id) ON DELETE RESTRICT,
    client_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(40) NOT NULL DEFAULT 'PENDING_REVIEW',
    price_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_items INTEGER NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    notes TEXT,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_sede_status ON orders (sede_id, status);
CREATE INDEX idx_orders_client ON orders (client_user_id);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_created ON orders (created_at_utc DESC);

-- order_items
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_type VARCHAR(10) NOT NULL CHECK (item_type IN ('producto', 'combo')),
    producto_id UUID REFERENCES productos(producto_id) ON DELETE RESTRICT,
    combo_id UUID REFERENCES combos(combo_id) ON DELETE RESTRICT,
    quantity DECIMAL(10,2) NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    CONSTRAINT order_items_item_check CHECK (
        (item_type = 'producto' AND producto_id IS NOT NULL AND combo_id IS NULL) OR
        (item_type = 'combo' AND combo_id IS NOT NULL AND producto_id IS NULL)
    )
);
CREATE INDEX idx_order_items_order ON order_items (order_id);

-- order_status_history
CREATE TABLE order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status VARCHAR(40),
    to_status VARCHAR(40) NOT NULL,
    changed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notes TEXT,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_status_history_order ON order_status_history (order_id, created_at_utc);

-- Seed order resources
INSERT INTO resources (id, code) VALUES
    ('66666666-0000-0000-0000-000000000040', 'order:create'),
    ('66666666-0000-0000-0000-000000000041', 'order:view'),
    ('66666666-0000-0000-0000-000000000042', 'order:update'),
    ('66666666-0000-0000-0000-000000000043', 'order:delete'),
    ('66666666-0000-0000-0000-000000000044', 'order:status:change')
ON CONFLICT (id) DO NOTHING;

-- admin_global gets all order permissions
INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code LIKE 'order:%'
ON CONFLICT (role_id, resource_id) DO NOTHING;

-- admin_sede gets create, view, update, status:change (no delete)
INSERT INTO role_resources (role_id, resource_id)
SELECT '22222222-2222-2222-2222-222222222222', id FROM resources
WHERE code IN ('order:create', 'order:view', 'order:update', 'order:status:change')
ON CONFLICT (role_id, resource_id) DO NOTHING;

-- cliente gets create and view
INSERT INTO role_resources (role_id, resource_id)
SELECT '11111111-1111-1111-1111-111111111111', id FROM resources
WHERE code IN ('order:create', 'order:view')
ON CONFLICT (role_id, resource_id) DO NOTHING;
