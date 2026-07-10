-- Introduce persons as master entity and link users 1:1 through person_id.

CREATE TABLE IF NOT EXISTS persons (
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_persons_identity_document ON persons (identity_document);

ALTER TABLE users ADD COLUMN IF NOT EXISTS person_id UUID;

WITH person_backfill AS (
    SELECT
        u.id AS user_id,
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
    WHERE u.person_id IS NULL
), upserted_persons AS (
    INSERT INTO persons (id, name, identity_document, tax_id, whatsapp_phone, full_address, is_client, created_at_utc, updated_at_utc)
    SELECT gen_random_uuid(), person_name, person_identity_document, person_tax_id, person_whatsapp_phone, person_full_address, is_client, created_at_utc, now()
    FROM person_backfill
    ON CONFLICT (identity_document) DO UPDATE SET
        name = EXCLUDED.name,
        tax_id = EXCLUDED.tax_id,
        whatsapp_phone = EXCLUDED.whatsapp_phone,
        full_address = EXCLUDED.full_address,
        is_client = EXCLUDED.is_client,
        updated_at_utc = now()
    RETURNING identity_document, id
)
UPDATE users u
SET person_id = up.id
FROM person_backfill pb
JOIN upserted_persons up ON up.identity_document = pb.person_identity_document
WHERE pb.user_id = u.id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_person_id_fkey'
          AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_person_id_fkey FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_person_id ON users (person_id);
