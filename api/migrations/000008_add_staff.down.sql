-- Rollback staff management changes

-- Remove role_resources for staff and manager
DELETE FROM role_resources WHERE role_id IN (
    SELECT id FROM roles WHERE code IN ('staff', 'manager')
);

-- Remove staff resources
DELETE FROM resources WHERE code IN ('staff:create', 'staff:view', 'staff:update', 'staff:delete');

-- Remove roles
DELETE FROM roles WHERE code IN ('staff', 'manager');

-- Restore columns to profiles
ALTER TABLE profiles ADD COLUMN first_name VARCHAR(120);
ALTER TABLE profiles ADD COLUMN last_name VARCHAR(120);
ALTER TABLE profiles ADD COLUMN identity_document VARCHAR(40);
ALTER TABLE profiles ADD COLUMN tax_id VARCHAR(40);
ALTER TABLE profiles ADD COLUMN whatsapp_phone VARCHAR(30);
ALTER TABLE profiles ADD COLUMN full_address VARCHAR(500);

-- Migrate data back from users to profiles
UPDATE profiles p SET
    first_name = split_part(p.name, ' ', 1),
    last_name = CASE WHEN position(' ' in p.name) > 0 THEN substring(p.name from position(' ' in p.name) + 1) ELSE '' END,
    identity_document = COALESCE(u.identity_document, p.code),
    tax_id = u.tax_id,
    whatsapp_phone = u.whatsapp_phone,
    full_address = u.full_address
FROM users u WHERE u.id = p.user_id;

-- Drop new columns from profiles
ALTER TABLE profiles DROP COLUMN name;
ALTER TABLE profiles DROP COLUMN code;

-- Drop columns from users
ALTER TABLE users DROP COLUMN branch_id;
ALTER TABLE users DROP COLUMN identity_document;
ALTER TABLE users DROP COLUMN tax_id;
ALTER TABLE users DROP COLUMN whatsapp_phone;
ALTER TABLE users DROP COLUMN full_address;
