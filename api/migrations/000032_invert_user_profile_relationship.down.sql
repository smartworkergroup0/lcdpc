-- Rollback invert user-profile relationship

-- 1. Add user_id back to profiles
ALTER TABLE profiles ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX idx_profiles_user_id ON profiles (user_id);

-- 2. Migrate data from users to profiles
UPDATE profiles p SET
    user_id = u.id
FROM users u
WHERE u.profile_id = p.id;

-- 3. Set NOT NULL after data migration
ALTER TABLE profiles ALTER COLUMN user_id SET NOT NULL;

-- 4. Drop columns from users
ALTER TABLE users DROP COLUMN name;
ALTER TABLE users DROP COLUMN profile_id;
