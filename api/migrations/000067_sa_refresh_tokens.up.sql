CREATE TABLE sa_refresh_tokens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash          VARCHAR(64) NOT NULL UNIQUE,
    service_account_id  UUID NOT NULL REFERENCES service_accounts(id) ON DELETE CASCADE,
    family_id           UUID NOT NULL,
    previous_token_hash VARCHAR(64),
    expires_at_utc      TIMESTAMPTZ NOT NULL,
    revoked_at_utc      TIMESTAMPTZ,
    created_at_utc      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sa_refresh_tokens_hash ON sa_refresh_tokens(token_hash);
CREATE INDEX idx_sa_refresh_tokens_family ON sa_refresh_tokens(family_id);
CREATE INDEX idx_sa_refresh_tokens_sa ON sa_refresh_tokens(service_account_id);
