-- Staff management: simplify profiles, move fields to users, create staff roles

-- 1. Add fields to users
ALTER TABLE users ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN identity_document VARCHAR(40);
ALTER TABLE users ADD COLUMN tax_id VARCHAR(40);
ALTER TABLE users ADD COLUMN whatsapp_phone VARCHAR(30);
ALTER TABLE users ADD COLUMN full_address VARCHAR(500);
CREATE INDEX idx_users_branch_id ON users(branch_id);

-- 2. Migrate data from profiles to users
UPDATE users u SET
    identity_document = p.identity_document,
    tax_id = p.tax_id,
    whatsapp_phone = p.whatsapp_phone,
    full_address = p.full_address
FROM profiles p
WHERE p.user_id = u.id;

-- 3. Add name and code to profiles
ALTER TABLE profiles ADD COLUMN name VARCHAR(200);
ALTER TABLE profiles ADD COLUMN code VARCHAR(100);

-- Migrate data
UPDATE profiles SET
    name = first_name || ' ' || last_name,
    code = identity_document;

-- Set NOT NULL after data migration
ALTER TABLE profiles ALTER COLUMN name SET NOT NULL;
ALTER TABLE profiles ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX idx_profiles_code ON profiles (code);

-- 4. Drop redundant columns from profiles
ALTER TABLE profiles DROP COLUMN first_name;
ALTER TABLE profiles DROP COLUMN last_name;
ALTER TABLE profiles DROP COLUMN identity_document;
ALTER TABLE profiles DROP COLUMN tax_id;
ALTER TABLE profiles DROP COLUMN whatsapp_phone;
ALTER TABLE profiles DROP COLUMN full_address;

-- 5. Create staff and manager roles
INSERT INTO roles (id, code, name, description) VALUES
    ('44444444-4444-4444-4444-444444444444', 'staff', 'staff', 'Staff member with basic operations access'),
    ('55555555-5555-5555-5555-555555555555', 'manager', 'manager', 'Branch manager with elevated access')
ON CONFLICT (code) DO NOTHING;

-- 6. Create staff resources
INSERT INTO resources (id, code) VALUES
    (gen_random_uuid(), 'staff:create'),
    (gen_random_uuid(), 'staff:view'),
    (gen_random_uuid(), 'staff:update'),
    (gen_random_uuid(), 'staff:delete')
ON CONFLICT (code) DO NOTHING;

-- 7. Assign staff permissions to global_admin
INSERT INTO role_resources (role_id, resource_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM resources
WHERE code IN ('staff:create', 'staff:view', 'staff:update', 'staff:delete')
ON CONFLICT (role_id, resource_id) DO NOTHING;

-- 8. Assign staff permissions to branch_admin
INSERT INTO role_resources (role_id, resource_id)
SELECT '22222222-2222-2222-2222-222222222222', id FROM resources
WHERE code IN ('staff:create', 'staff:view', 'staff:update', 'staff:delete')
ON CONFLICT (role_id, resource_id) DO NOTHING;

-- 9. Assign permissions to staff role
INSERT INTO role_resources (role_id, resource_id)
SELECT '44444444-4444-4444-4444-444444444444', id FROM resources
WHERE code IN ('product:view', 'bundle:view', 'price:view', 'branch:view', 'order:view', 'order:create', 'order:status:change')
ON CONFLICT (role_id, resource_id) DO NOTHING;

-- 10. Assign permissions to manager role (staff + more)
INSERT INTO role_resources (role_id, resource_id)
SELECT '55555555-5555-5555-5555-555555555555', id FROM resources
WHERE code IN (
    'product:view', 'product:create', 'product:update',
    'bundle:view', 'bundle:create', 'bundle:update', 'bundle:delete',
    'price:view', 'price:create', 'price:update',
    'branch:view',
    'order:view', 'order:create', 'order:update', 'order:delete', 'order:status:change'
)
ON CONFLICT (role_id, resource_id) DO NOTHING;
