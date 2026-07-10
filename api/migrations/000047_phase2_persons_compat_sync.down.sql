DROP TRIGGER IF EXISTS trg_users_sync_persons_legacy_fields ON users;
DROP FUNCTION IF EXISTS sync_persons_from_users_legacy_fields();

DROP TRIGGER IF EXISTS trg_persons_sync_users_legacy_fields ON persons;
DROP FUNCTION IF EXISTS sync_users_person_legacy_fields();

ALTER TABLE users
    ALTER COLUMN person_id DROP NOT NULL;
