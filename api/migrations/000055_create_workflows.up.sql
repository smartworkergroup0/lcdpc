CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    description TEXT NOT NULL DEFAULT '',
    entity_type VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    definition JSONB NOT NULL DEFAULT '{}',
    created_at_utc TIMESTAMP NOT NULL DEFAULT now(),
    updated_at_utc TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflows_entity_type ON workflows(entity_type);
CREATE INDEX idx_workflows_is_active ON workflows(is_active);
