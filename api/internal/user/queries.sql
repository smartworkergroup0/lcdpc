-- User queries

-- name: GetUserByID :one
SELECT u.id, u.email, u.password_hash, u.onboarding_status, u.email_verified_at_utc, u.status, u.created_at_utc
FROM users u
WHERE u.id = $1;

-- name: GetUserByEmail :one
SELECT u.id, u.email, u.password_hash, u.onboarding_status, u.email_verified_at_utc, u.status, u.created_at_utc
FROM users u
WHERE u.email = $1;

-- name: UserExistsByEmail :one
SELECT EXISTS(SELECT 1 FROM users WHERE email = $1);

-- name: CreateUser :one
INSERT INTO users (id, email, password_hash, onboarding_status, email_verified_at_utc, status, created_at_utc)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, email, password_hash, onboarding_status, email_verified_at_utc, status, created_at_utc;

-- name: UpdateUserPassword :exec
UPDATE users SET password_hash = $2 WHERE id = $1;

-- name: UpdateUserStatus :exec
UPDATE users SET status = $2 WHERE id = $1;

-- name: ListUsers :many
SELECT u.id, u.email, u.onboarding_status, u.status, u.created_at_utc,
       p.name
FROM users u
LEFT JOIN persons p ON p.id = u.person_id
ORDER BY u.created_at_utc DESC
LIMIT $1 OFFSET $2;

-- name: CountUsers :one
SELECT COUNT(*) FROM users;

-- name: SearchUsers :many
SELECT u.id, u.email, u.onboarding_status, u.status, u.created_at_utc,
       p.name
FROM users u
LEFT JOIN persons p ON p.id = u.person_id
WHERE u.email ILIKE '%' || $1 || '%'
   OR p.name ILIKE '%' || $1 || '%'
ORDER BY u.created_at_utc DESC
LIMIT $2 OFFSET $3;

-- Profile queries

-- name: GetProfileByUserID :one
SELECT id, name, code, created_at_utc, updated_at_utc
FROM profiles
WHERE id = (SELECT profile_id FROM users WHERE id = $1);

-- name: CreateProfile :exec
INSERT INTO profiles (id, name, code, created_at_utc, updated_at_utc)
VALUES ($1, $2, $3, $4, $5);

-- Role queries

-- name: GetRoleByCode :one
SELECT id, code, name, description FROM roles WHERE code = $1;

-- name: ListRoles :many
SELECT id, code, name, description FROM roles ORDER BY code;

-- User Role Assignment queries

-- name: CreateUserRoleAssignment :exec
INSERT INTO user_role_assignments (id, user_id, role_id, sede_ids, active, created_at_utc)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: GetActiveRolesByUserID :many
SELECT r.code, r.name, ura.sede_ids
FROM user_role_assignments ura
JOIN roles r ON r.id = ura.role_id
WHERE ura.user_id = $1 AND ura.active = true;

-- name: GetActiveRolesWithPermissionsByUserID :many
SELECT r.code, rrp.resource_id, rrp.can_view, rrp.can_write, rrp.can_update, rrp.can_delete, rrp.can_all
FROM user_role_assignments ura
JOIN roles r ON r.id = ura.role_id
JOIN role_resource_permissions rrp ON rrp.role_id = r.id
WHERE ura.user_id = $1 AND ura.active = true;

-- User Session queries (legacy)

-- name: CreateUserSession :exec
INSERT INTO user_sessions (id, user_id, access_token_hash, refresh_token_hash, access_token_expires_at_utc, refresh_token_expires_at_utc, created_at_utc)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: GetSessionByAccessTokenHash :one
SELECT id, user_id, access_token_hash, refresh_token_hash, access_token_expires_at_utc, refresh_token_expires_at_utc, created_at_utc, revoked_at_utc
FROM user_sessions
WHERE access_token_hash = $1 AND revoked_at_utc IS NULL AND access_token_expires_at_utc > now();

-- name: RevokeUserSessionsByUserID :exec
UPDATE user_sessions SET revoked_at_utc = now() WHERE user_id = $1 AND revoked_at_utc IS NULL;

-- name: RevokeSessionByAccessTokenHash :exec
UPDATE user_sessions SET revoked_at_utc = now() WHERE access_token_hash = $1 AND revoked_at_utc IS NULL;

-- Password Reset Token queries

-- name: CreatePasswordResetToken :exec
INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at_utc, created_at_utc)
VALUES ($1, $2, $3, $4, $5);

-- name: GetValidPasswordResetToken :one
SELECT id, user_id, token_hash, expires_at_utc, created_at_utc, used_at_utc, revoked_at_utc
FROM password_reset_tokens
WHERE token_hash = $1 AND used_at_utc IS NULL AND revoked_at_utc IS NULL AND expires_at_utc > now();

-- name: UsePasswordResetToken :exec
UPDATE password_reset_tokens SET used_at_utc = now() WHERE id = $1;

-- name: RevokePasswordResetTokensByUserID :exec
UPDATE password_reset_tokens SET revoked_at_utc = now() WHERE user_id = $1 AND used_at_utc IS NULL AND revoked_at_utc IS NULL;

-- Auth Security Policy queries

-- name: GetAuthSecurityPolicy :one
SELECT id, password_reset_ttl_minutes, revoke_sessions_on_password_reset, updated_at_utc
FROM auth_security_policies
LIMIT 1;

-- name: UpdateAuthSecurityPolicy :exec
UPDATE auth_security_policies
SET password_reset_ttl_minutes = $2, revoke_sessions_on_password_reset = $3, updated_at_utc = now()
WHERE id = $1;

-- Audit Log queries

-- name: CreateAuditLog :exec
INSERT INTO audit_logs (id, user_id, action_code, area, metadata_json, ip_address, created_at_utc)
VALUES ($1, $2, $3, $4, $5, $6, $7);
