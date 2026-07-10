-- Rollback persons master entity.

DROP INDEX IF EXISTS idx_users_person_id;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_person_id_fkey;
ALTER TABLE users DROP COLUMN IF EXISTS person_id;
DROP TABLE IF EXISTS persons;
