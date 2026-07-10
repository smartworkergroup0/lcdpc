package staff

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lcdpc/lcdpc-go/internal/auth"
	"github.com/lcdpc/lcdpc-go/internal/rbac"
)

type Service struct {
	pool  *pgxpool.Pool
	store *rbac.Store
}

func NewService(pool *pgxpool.Pool, store *rbac.Store) *Service {
	return &Service{pool: pool, store: store}
}

type StaffMember struct {
	UserID           uuid.UUID  `json:"user_id"`
	Email            string     `json:"email"`
	Status           string     `json:"status"`
	BranchID         *uuid.UUID `json:"branch_id"`
	BranchName       *string    `json:"branch_name"`
	IdentityDocument string     `json:"identity_document"`
	WhatsAppPhone    string     `json:"whatsapp_phone"`
	ProfileID        uuid.UUID  `json:"profile_id"`
	ProfileName      string     `json:"profile_name"`
	ProfileCode      string     `json:"profile_code"`
	RoleCode         string     `json:"role_code"`
	RoleName         string     `json:"role_name"`
	CreatedAtUtc     time.Time  `json:"created_at_utc"`
}

type CreateStaffRequest struct {
	Email            string    `json:"email" validate:"required"`
	Password         string    `json:"password" validate:"required"`
	Name             string    `json:"name" validate:"required"`
	Code             string    `json:"code" validate:"required"`
	IdentityDocument string    `json:"identity_document" validate:"required"`
	WhatsAppPhone    string    `json:"whatsapp_phone" validate:"required"`
	FullAddress      string    `json:"full_address" validate:"required"`
	BranchID         uuid.UUID `json:"branch_id" validate:"required"`
	RoleCode         string    `json:"role_code" validate:"required"`
}

type UpdateStaffRequest struct {
	Name             string     `json:"name"`
	Code             string     `json:"code"`
	IdentityDocument string     `json:"identity_document"`
	WhatsAppPhone    string     `json:"whatsapp_phone"`
	FullAddress      string     `json:"full_address"`
	BranchID         *uuid.UUID `json:"branch_id"`
	RoleCode         *string    `json:"role_code"`
	Status           *string    `json:"status"`
}

type StaffFilter struct {
	Limit    int
	Offset   int
	BranchID *uuid.UUID
	RoleCode *string
	Search   *string
}

var excludedRoles = []string{"global_admin", "branch_admin", "client"}

const errLastSuperadminForbidden = "LAST_SUPERADMIN_FORBIDDEN"

func (f StaffFilter) GetLimit() int {
	if f.Limit <= 0 {
		return 10
	}
	if f.Limit > 100 {
		return 100
	}
	return f.Limit
}

func (f StaffFilter) GetOffset() int {
	if f.Offset < 0 {
		return 0
	}
	return f.Offset
}

func (s *Service) List(ctx context.Context, filter StaffFilter) ([]StaffMember, int, error) {
	countQuery := `
		SELECT COUNT(*)
		FROM users u
		LEFT JOIN persons per ON per.id = u.person_id
		JOIN profiles p ON p.id = u.profile_id
		JOIN profile_role_assignments pra ON pra.profile_id = p.id AND pra.active = true
		JOIN roles r ON r.id = pra.role_id
		WHERE r.code NOT IN ('global_admin', 'branch_admin', 'client')
	`
	dataQuery := `
		SELECT u.id, u.email, u.status, u.branch_id, b.store_name,
		       per.identity_document, per.whatsapp_phone,
		       p.id, per.name, p.code,
		       r.code, r.name, u.created_at_utc
		FROM users u
		LEFT JOIN persons per ON per.id = u.person_id
		JOIN profiles p ON p.id = u.profile_id
		JOIN profile_role_assignments pra ON pra.profile_id = p.id AND pra.active = true
		JOIN roles r ON r.id = pra.role_id
		LEFT JOIN branches b ON b.id = u.branch_id
		WHERE r.code NOT IN ('global_admin', 'branch_admin', 'client')
	`

	var args []interface{}
	argIdx := 1

	if filter.BranchID != nil {
		clause := fmt.Sprintf(` AND u.branch_id = $%d`, argIdx)
		countQuery += clause
		dataQuery += clause
		args = append(args, *filter.BranchID)
		argIdx++
	}
	if filter.RoleCode != nil {
		clause := fmt.Sprintf(` AND r.code = $%d`, argIdx)
		countQuery += clause
		dataQuery += clause
		args = append(args, *filter.RoleCode)
		argIdx++
	}
	if filter.Search != nil && *filter.Search != "" {
		clause := fmt.Sprintf(` AND (per.name ILIKE '%%' || $%d || '%%' OR u.email ILIKE '%%' || $%d || '%%' OR per.identity_document ILIKE '%%' || $%d || '%%')`, argIdx, argIdx, argIdx)
		countQuery += clause
		dataQuery += clause
		args = append(args, *filter.Search)
		argIdx++
	}

	var totalCount int
	if err := s.pool.QueryRow(ctx, countQuery, args...).Scan(&totalCount); err != nil {
		return nil, 0, fmt.Errorf("count staff: %w", err)
	}

	dataQuery += ` ORDER BY u.created_at_utc DESC`
	dataQuery += fmt.Sprintf(` LIMIT $%d OFFSET $%d`, argIdx, argIdx+1)
	args = append(args, filter.GetLimit(), filter.GetOffset())

	rows, err := s.pool.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list staff: %w", err)
	}
	defer rows.Close()

	var members []StaffMember
	for rows.Next() {
		var m StaffMember
		if err := rows.Scan(
			&m.UserID, &m.Email, &m.Status, &m.BranchID, &m.BranchName,
			&m.IdentityDocument, &m.WhatsAppPhone,
			&m.ProfileID, &m.ProfileName, &m.ProfileCode,
			&m.RoleCode, &m.RoleName, &m.CreatedAtUtc,
		); err != nil {
			return nil, 0, fmt.Errorf("scan staff: %w", err)
		}
		members = append(members, m)
	}
	return members, totalCount, nil
}

func (s *Service) GetByID(ctx context.Context, userID uuid.UUID) (*StaffMember, error) {
	var m StaffMember
	err := s.pool.QueryRow(ctx, `
		SELECT u.id, u.email, u.status, u.branch_id, b.store_name,
		       per.identity_document, per.whatsapp_phone,
		       p.id, per.name, p.code,
		       r.code, r.name, u.created_at_utc
		FROM users u
		LEFT JOIN persons per ON per.id = u.person_id
		JOIN profiles p ON p.id = u.profile_id
		JOIN profile_role_assignments pra ON pra.profile_id = p.id AND pra.active = true
		JOIN roles r ON r.id = pra.role_id
		LEFT JOIN branches b ON b.id = u.branch_id
		WHERE u.id = $1
	`, userID).Scan(
		&m.UserID, &m.Email, &m.Status, &m.BranchID, &m.BranchName,
		&m.IdentityDocument, &m.WhatsAppPhone,
		&m.ProfileID, &m.ProfileName, &m.ProfileCode,
		&m.RoleCode, &m.RoleName, &m.CreatedAtUtc,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get staff: %w", err)
	}
	return &m, nil
}

func (s *Service) Create(ctx context.Context, req CreateStaffRequest) (*StaffMember, error) {
	pwHash, err := auth.HashPassword(req.Password)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	userID := uuid.New()
	profileID := uuid.New()
	personID := uuid.New()

	_, err = tx.Exec(ctx, `
		INSERT INTO profiles (id, name, code, created_at_utc, updated_at_utc)
		VALUES ($1, $2, $3, now(), now())
	`, profileID, req.Name, req.Code)
	if err != nil {
		return nil, fmt.Errorf("create profile: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO persons (id, name, identity_document, tax_id, whatsapp_phone, full_address, is_client, created_at_utc, updated_at_utc)
		VALUES ($1, $2, $3, NULL, $4, $5, false, now(), now())
	`, personID, req.Name, req.IdentityDocument, req.WhatsAppPhone, req.FullAddress)
	if err != nil {
		return nil, fmt.Errorf("create person: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO users (
			id, email, password_hash, onboarding_status, status, profile_id, person_id, branch_id, created_at_utc
		)
		VALUES ($1, $2, $3, 'active', 'Active', $4, $5, $6, now())
	`, userID, req.Email, pwHash, profileID, personID, req.BranchID)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	var roleID uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id FROM roles WHERE code = $1`, req.RoleCode).Scan(&roleID)
	if err != nil {
		return nil, fmt.Errorf("get role %s: %w", req.RoleCode, err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO profile_role_assignments (id, profile_id, role_id, active, created_at_utc)
		VALUES ($1, $2, $3, true, now())
	`, uuid.New(), profileID, roleID)
	if err != nil {
		return nil, fmt.Errorf("assign role: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	if err := s.store.ReloadAll(ctx, s.pool); err != nil {
		return nil, fmt.Errorf("reload rbac: %w", err)
	}

	return s.GetByID(ctx, userID)
}

func (s *Service) Update(ctx context.Context, userID uuid.UUID, req UpdateStaffRequest) (*StaffMember, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Get profile + person IDs
	var profileID uuid.UUID
	var personID uuid.UUID
	err = tx.QueryRow(ctx, `SELECT profile_id, person_id FROM users WHERE id = $1`, userID).Scan(&profileID, &personID)
	if err != nil {
		return nil, fmt.Errorf("get profile: %w", err)
	}

	if personID == uuid.Nil {
		return nil, fmt.Errorf("PERSON_NOT_LINKED")
	}

	// Update person first (source of truth)
	if req.Name != "" || req.IdentityDocument != "" || req.WhatsAppPhone != "" || req.FullAddress != "" {
		_, err = tx.Exec(ctx, `
			UPDATE persons SET
				name = COALESCE(NULLIF($2, ''), name),
				identity_document = COALESCE(NULLIF($3, ''), identity_document),
				whatsapp_phone = COALESCE(NULLIF($4, ''), whatsapp_phone),
				full_address = COALESCE(NULLIF($5, ''), full_address),
				updated_at_utc = now()
			WHERE id = $1
		`, personID, req.Name, req.IdentityDocument, req.WhatsAppPhone, req.FullAddress)
		if err != nil {
			return nil, fmt.Errorf("update person: %w", err)
		}
	}

	if req.BranchID != nil || req.Status != nil {
		_, err = tx.Exec(ctx, `
			UPDATE users u SET
				branch_id = COALESCE($2, u.branch_id),
				status = COALESCE($3, u.status)
			WHERE u.id = $1
		`, userID, req.BranchID, req.Status)
		if err != nil {
			return nil, fmt.Errorf("mirror user: %w", err)
		}
	}

	if req.Code != "" {
		_, err = tx.Exec(ctx, `UPDATE profiles SET code = $2, updated_at_utc = now() WHERE id = $1`, profileID, req.Code)
		if err != nil {
			return nil, fmt.Errorf("update profile code: %w", err)
		}
	}

	// Update role if changed
	if req.RoleCode != nil && *req.RoleCode != "" {
		// Remove old assignment
		_, _ = tx.Exec(ctx, `DELETE FROM profile_role_assignments WHERE profile_id = $1`, profileID)

		var roleID uuid.UUID
		err = tx.QueryRow(ctx, `SELECT id FROM roles WHERE code = $1`, *req.RoleCode).Scan(&roleID)
		if err != nil {
			return nil, fmt.Errorf("get role %s: %w", *req.RoleCode, err)
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO profile_role_assignments (id, profile_id, role_id, active, created_at_utc)
			VALUES ($1, $2, $3, true, now())
		`, uuid.New(), profileID, roleID)
		if err != nil {
			return nil, fmt.Errorf("assign role: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	if err := s.store.ReloadAll(ctx, s.pool); err != nil {
		return nil, fmt.Errorf("reload rbac: %w", err)
	}

	return s.GetByID(ctx, userID)
}

func (s *Service) Delete(ctx context.Context, userID uuid.UUID) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var profileID uuid.UUID
	var personID uuid.UUID
	var isSuperadmin bool
	err = tx.QueryRow(ctx, `
		SELECT u.profile_id, u.person_id, EXISTS(
			SELECT 1
			FROM profile_role_assignments pra
			JOIN roles r ON r.id = pra.role_id
			WHERE pra.profile_id = u.profile_id
			  AND pra.active = true
			  AND r.code = 'global_admin'
		) AS is_superadmin
		FROM users u
		WHERE u.id = $1
	`, userID).Scan(&profileID, &personID, &isSuperadmin)
	if err != nil {
		if err == pgx.ErrNoRows {
			return fmt.Errorf("NOT_FOUND")
		}
		return fmt.Errorf("get profile: %w", err)
	}

	if isSuperadmin {
		var superadminCount int
		err = tx.QueryRow(ctx, `
			SELECT COUNT(*)
			FROM users u
			JOIN profiles p ON p.id = u.profile_id
			JOIN profile_role_assignments pra ON pra.profile_id = p.id AND pra.active = true
			JOIN roles r ON r.id = pra.role_id
			WHERE r.code = 'global_admin'
			  AND lower(u.status) = 'active'
		`).Scan(&superadminCount)
		if err != nil {
			return fmt.Errorf("count superadmins: %w", err)
		}
		if superadminCount <= 1 {
			return fmt.Errorf(errLastSuperadminForbidden)
		}
	}

	_, _ = tx.Exec(ctx, `DELETE FROM profile_role_assignments WHERE profile_id = $1`, profileID)

	// Delete user first so users.person_id is not nulled by the FK action.
	_, err = tx.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	if err != nil {
		return fmt.Errorf("delete user: %w", err)
	}

	if _, err = tx.Exec(ctx, `DELETE FROM persons WHERE id = $1`, personID); err != nil {
		return fmt.Errorf("delete person: %w", err)
	}

	// Delete profile
	tag, err := tx.Exec(ctx, `DELETE FROM profiles WHERE id = $1`, profileID)
	if err != nil {
		return fmt.Errorf("delete profile: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("NOT_FOUND")
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}

	if err := s.store.ReloadAll(ctx, s.pool); err != nil {
		return fmt.Errorf("reload rbac: %w", err)
	}

	return nil
}
