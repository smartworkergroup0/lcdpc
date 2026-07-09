-- Phase 3 cleanup: users becomes credentials-focused; personal data lives in persons only.

DROP TRIGGER IF EXISTS trg_users_sync_persons_legacy_fields ON users;
DROP FUNCTION IF EXISTS sync_persons_from_users_legacy_fields();

DROP TRIGGER IF EXISTS trg_persons_sync_users_legacy_fields ON persons;
DROP FUNCTION IF EXISTS sync_users_person_legacy_fields();

ALTER TABLE users
    DROP COLUMN IF EXISTS name,
    DROP COLUMN IF EXISTS identity_document,
    DROP COLUMN IF EXISTS tax_id,
    DROP COLUMN IF EXISTS whatsapp_phone,
    DROP COLUMN IF EXISTS full_address;
