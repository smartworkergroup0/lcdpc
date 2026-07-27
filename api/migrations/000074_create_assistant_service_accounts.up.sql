CREATE TABLE assistant_service_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(200) NOT NULL,
    password VARCHAR(500) NOT NULL,
    branch_id UUID NOT NULL REFERENCES branches(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at_utc TIMESTAMPTZ
);

CREATE INDEX idx_asa_branch_id ON assistant_service_accounts(branch_id) WHERE deleted_at_utc IS NULL;
CREATE INDEX idx_asa_deleted_at ON assistant_service_accounts(deleted_at_utc) WHERE deleted_at_utc IS NULL;

INSERT INTO resources (id, code) VALUES
    (gen_random_uuid(), 'assistant_session:view'),
    (gen_random_uuid(), 'assistant_session:create'),
    (gen_random_uuid(), 'assistant_session:update'),
    (gen_random_uuid(), 'assistant_session:delete')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code LIKE 'assistant_session:%'
ON CONFLICT (role_id, resource_id) DO NOTHING;
