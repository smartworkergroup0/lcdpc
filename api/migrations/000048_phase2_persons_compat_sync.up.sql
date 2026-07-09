-- Phase 2 compatibility sync: persons remains source of truth for personal data,
-- while legacy users columns stay mirrored for older reads.

ALTER TABLE users
    ALTER COLUMN person_id SET NOT NULL;

CREATE OR REPLACE FUNCTION sync_users_person_legacy_fields() RETURNS trigger AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;

    UPDATE users u
    SET name = NEW.name,
        identity_document = NEW.identity_document,
        tax_id = NEW.tax_id,
        whatsapp_phone = NEW.whatsapp_phone,
        full_address = NEW.full_address
    WHERE u.person_id = NEW.id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_persons_sync_users_legacy_fields ON persons;
CREATE TRIGGER trg_persons_sync_users_legacy_fields
AFTER INSERT OR UPDATE OF name, identity_document, tax_id, whatsapp_phone, full_address ON persons
FOR EACH ROW
EXECUTE FUNCTION sync_users_person_legacy_fields();

CREATE OR REPLACE FUNCTION sync_persons_from_users_legacy_fields() RETURNS trigger AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;

    IF NEW.person_id IS NULL THEN
        RETURN NULL;
    END IF;

    UPDATE persons p
    SET name = NEW.name,
        identity_document = NEW.identity_document,
        tax_id = NEW.tax_id,
        whatsapp_phone = NEW.whatsapp_phone,
        full_address = NEW.full_address,
        updated_at_utc = now()
    WHERE p.id = NEW.person_id
      AND (
        OLD.name IS DISTINCT FROM NEW.name OR
        OLD.identity_document IS DISTINCT FROM NEW.identity_document OR
        OLD.tax_id IS DISTINCT FROM NEW.tax_id OR
        OLD.whatsapp_phone IS DISTINCT FROM NEW.whatsapp_phone OR
        OLD.full_address IS DISTINCT FROM NEW.full_address
      );

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_sync_persons_legacy_fields ON users;
CREATE TRIGGER trg_users_sync_persons_legacy_fields
AFTER UPDATE OF name, identity_document, tax_id, whatsapp_phone, full_address ON users
FOR EACH ROW
EXECUTE FUNCTION sync_persons_from_users_legacy_fields();
