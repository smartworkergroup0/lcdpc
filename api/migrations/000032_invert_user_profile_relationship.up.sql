-- Invert user-profile relationship: profiles no longer have user_id;
-- users now have name and profile_id.

-- 1. Add columns to users
ALTER TABLE users ADD COLUMN name VARCHAR(200);
ALTER TABLE users ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. Migrate data from profiles to users
UPDATE users u SET
    name = p.name,
    profile_id = p.id
FROM profiles p
WHERE p.user_id = u.id;

-- 3. Set NOT NULL after data migration
ALTER TABLE users ALTER COLUMN name SET NOT NULL;

-- 4. Drop user_id from profiles (keep name and code)
ALTER TABLE profiles DROP COLUMN user_id;
DROP INDEX IF EXISTS idx_profiles_user_id;
