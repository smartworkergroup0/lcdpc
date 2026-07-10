-- Admin queries (for admin operations)

-- name: ListUsersWithProfiles :many
SELECT u.id, u.email, u.onboarding_status, u.status, u.created_at_utc,
	       per.name AS person_name,
	       per.identity_document AS identity_document,
	       per.whatsapp_phone AS whatsapp_phone
FROM users u
LEFT JOIN persons per ON per.id = u.person_id
ORDER BY u.created_at_utc DESC
LIMIT $1 OFFSET $2;

-- name: AdminUpdateUserStatus :exec
UPDATE users SET status = $2 WHERE id = $1;

-- name: AdminAssignRole :exec
INSERT INTO user_role_assignments (id, user_id, role_id, sede_ids, active, created_at_utc)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: AdminGetUserRoleAssignments :many
SELECT ura.id, ura.role_id, r.code as role_code, ura.sede_ids, ura.active
FROM user_role_assignments ura
JOIN roles r ON r.id = ura.role_id
WHERE ura.user_id = $1;

-- name: GetRolesByUserID :many
SELECT r.code
FROM user_role_assignments ura
JOIN roles r ON r.id = ura.role_id
WHERE ura.user_id = $1 AND ura.active = true;
