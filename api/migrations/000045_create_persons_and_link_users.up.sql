-- Introduce persons as master entity and link users 1:1 through person_id.

CREATE TABLE persons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    identity_document VARCHAR(40) NOT NULL,
    tax_id VARCHAR(40),
    whatsapp_phone VARCHAR(30) NOT NULL,
    full_address VARCHAR(500) NOT NULL,
    is_client BOOLEAN NOT NULL DEFAULT false,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_persons_identity_document ON persons (identity_document);

ALTER TABLE users ADD COLUMN person_id UUID;

WITH person_backfill AS (
    SELECT
        u.id AS user_id,
        gen_random_uuid() AS person_id,
        COALESCE(NULLIF(u.name, ''), NULLIF(p.name, ''), u.email) AS person_name,
        COALESCE(NULLIF(u.identity_document, ''), u.id::text) AS person_identity_document,
        NULLIF(u.tax_id, '') AS person_tax_id,
        COALESCE(NULLIF(u.whatsapp_phone, ''), '') AS person_whatsapp_phone,
        COALESCE(NULLIF(u.full_address, ''), '') AS person_full_address,
        EXISTS(
            SELECT 1
            FROM profile_role_assignments pra
            JOIN roles r ON r.id = pra.role_id
            WHERE pra.profile_id = u.profile_id
              AND pra.active = true
              AND r.code IN ('client', 'cliente')
        ) AS is_client,
        u.created_at_utc AS created_at_utc
    FROM users u
    LEFT JOIN profiles p ON p.id = u.profile_id
), inserted_persons AS (
    INSERT INTO persons (id, name, identity_document, tax_id, whatsapp_phone, full_address, is_client, created_at_utc, updated_at_utc)
    SELECT person_id, person_name, person_identity_document, person_tax_id, person_whatsapp_phone, person_full_address, is_client, created_at_utc, now()
    FROM person_backfill
    RETURNING id
)
UPDATE users u
SET person_id = pb.person_id
FROM person_backfill pb
WHERE pb.user_id = u.id;

ALTER TABLE users
    ADD CONSTRAINT users_person_id_fkey FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX idx_users_person_id ON users (person_id);
