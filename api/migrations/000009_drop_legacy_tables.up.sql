-- Drop legacy permission tables superseded by RBAC (migration 000002)
DROP TABLE IF EXISTS role_resource_permissions CASCADE;
DROP TABLE IF EXISTS api_resources CASCADE;
DROP TABLE IF EXISTS user_role_assignments CASCADE;
