package rbac

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	pool  *pgxpool.Pool
	store *Store
}

func NewService(pool *pgxpool.Pool, store *Store) *Service {
	return &Service{pool: pool, store: store}
}

// Resources

func (s *Service) ListResources(ctx context.Context) ([]ResourceResponse, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, code FROM resources ORDER BY code`)
	if err != nil {
		return nil, fmt.Errorf("list resources: %w", err)
	}
	defer rows.Close()

	var resources []ResourceResponse
	for rows.Next() {
		var r ResourceResponse
		if err := rows.Scan(&r.ID, &r.Code); err != nil {
			return nil, fmt.Errorf("scan resource: %w", err)
		}
		resources = append(resources, r)
	}
	return resources, nil
}

func (s *Service) GetResource(ctx context.Context, id uuid.UUID) (*ResourceResponse, error) {
	var r ResourceResponse
	err := s.pool.QueryRow(ctx, `SELECT id, code FROM resources WHERE id = $1`, id).Scan(&r.ID, &r.Code)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("RESOURCE_NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get resource: %w", err)
	}
	return &r, nil
}

func (s *Service) CreateResource(ctx context.Context, req CreateResourceRequest) (*ResourceResponse, error) {
	var r ResourceResponse
	err := s.pool.QueryRow(ctx, `
		INSERT INTO resources (id, code) VALUES ($1, $2) RETURNING id, code
	`, uuid.New(), req.Code).Scan(&r.ID, &r.Code)
	if err != nil {
		return nil, fmt.Errorf("create resource: %w", err)
	}
	if err := s.store.ReloadAll(ctx, s.pool); err != nil {
		return nil, fmt.Errorf("reload rbac: %w", err)
	}
	return &r, nil
}

func (s *Service) UpdateResource(ctx context.Context, id uuid.UUID, req UpdateResourceRequest) (*ResourceResponse, error) {
	var r ResourceResponse
	err := s.pool.QueryRow(ctx, `
		UPDATE resources SET code = $2 WHERE id = $1 RETURNING id, code
	`, id, req.Code).Scan(&r.ID, &r.Code)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("RESOURCE_NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("update resource: %w", err)
	}
	if err := s.store.ReloadAll(ctx, s.pool); err != nil {
		return nil, fmt.Errorf("reload rbac: %w", err)
	}
	return &r, nil
}

func (s *Service) DeleteResource(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM resources WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete resource: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("RESOURCE_NOT_FOUND")
	}
	if err := s.store.ReloadAll(ctx, s.pool); err != nil {
		return fmt.Errorf("reload rbac: %w", err)
	}
	return nil
}

// Roles

func (s *Service) ListRoles(ctx context.Context) ([]RoleResponse, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, code, name, description FROM roles ORDER BY code`)
	if err != nil {
		return nil, fmt.Errorf("list roles: %w", err)
	}
	defer rows.Close()

	var roles []RoleResponse
	for rows.Next() {
		var r RoleResponse
		if err := rows.Scan(&r.ID, &r.Code, &r.Name, &r.Description); err != nil {
			return nil, fmt.Errorf("scan role: %w", err)
		}
		r.Resources, _ = s.getResourcesForRole(ctx, r.ID)
		roles = append(roles, r)
	}
	return roles, nil
}

func (s *Service) GetRole(ctx context.Context, id uuid.UUID) (*RoleResponse, error) {
	var r RoleResponse
	err := s.pool.QueryRow(ctx, `SELECT id, code, name, description FROM roles WHERE id = $1`, id).Scan(
		&r.ID, &r.Code, &r.Name, &r.Description,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("ROLE_NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get role: %w", err)
	}
	r.Resources, _ = s.getResourcesForRole(ctx, r.ID)
	return &r, nil
}

func (s *Service) CreateRole(ctx context.Context, req CreateRoleRequest) (*RoleResponse, error) {
	var r RoleResponse
	err := s.pool.QueryRow(ctx, `
		INSERT INTO roles (id, code, name, description) VALUES ($1, $2, $3, $4)
		RETURNING id, code, name, description
	`, uuid.New(), req.Code, req.Name, req.Description).Scan(&r.ID, &r.Code, &r.Name, &r.Description)
	if err != nil {
		return nil, fmt.Errorf("create role: %w", err)
	}
	r.Resources = []ResourceEntry{}
	if err := s.store.ReloadAll(ctx, s.pool); err != nil {
		return nil, fmt.Errorf("reload rbac: %w", err)
	}
	return &r, nil
}

func (s *Service) UpdateRole(ctx context.Context, id uuid.UUID, req UpdateRoleRequest) (*RoleResponse, error) {
	var r RoleResponse
	err := s.pool.QueryRow(ctx, `
		UPDATE roles SET code = $2, name = $3, description = $4 WHERE id = $1
		RETURNING id, code, name, description
	`, id, req.Code, req.Name, req.Description).Scan(&r.ID, &r.Code, &r.Name, &r.Description)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("ROLE_NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("update role: %w", err)
	}
	r.Resources, _ = s.getResourcesForRole(ctx, r.ID)
	if err := s.store.ReloadAll(ctx, s.pool); err != nil {
		return nil, fmt.Errorf("reload rbac: %w", err)
	}
	return &r, nil
}

func (s *Service) DeleteRole(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM roles WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("ROLE_NOT_FOUND")
	}
	if err := s.store.ReloadAll(ctx, s.pool); err != nil {
		return fmt.Errorf("reload rbac: %w", err)
	}
	return nil
}

func (s *Service) AssignResourceToRole(ctx context.Context, roleID uuid.UUID, req AssignResourceRequest) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO role_resources (id, role_id, resource_id) VALUES ($1, $2, $3)
		ON CONFLICT (role_id, resource_id) DO NOTHING
	`, uuid.New(), roleID, req.ResourceID)
	if err != nil {
		return fmt.Errorf("assign resource: %w", err)
	}
	if err := s.store.ReloadAll(ctx, s.pool); err != nil {
		return fmt.Errorf("reload rbac: %w", err)
	}
	return nil
}

func (s *Service) RemoveResourceFromRole(ctx context.Context, roleID, resourceID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM role_resources WHERE role_id = $1 AND resource_id = $2`, roleID, resourceID)
	if err != nil {
		return fmt.Errorf("remove resource: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("ASSIGNMENT_NOT_FOUND")
	}
	if err := s.store.ReloadAll(ctx, s.pool); err != nil {
		return fmt.Errorf("reload rbac: %w", err)
	}
	return nil
}

// Profiles

func (s *Service) ListProfiles(ctx context.Context) ([]ProfileResponse, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT p.id, p.name, p.code, p.created_at_utc, p.updated_at_utc,
		       (SELECT COUNT(*) FROM users u WHERE u.profile_id = p.id) AS user_count
		FROM profiles p
		ORDER BY p.created_at_utc DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list profiles: %w", err)
	}
	defer rows.Close()

	var profiles []ProfileResponse
	for rows.Next() {
		var p ProfileResponse
		if err := rows.Scan(&p.ID, &p.Name, &p.Code, &p.CreatedAt, &p.UpdatedAt, &p.UserCount); err != nil {
			return nil, fmt.Errorf("scan profile: %w", err)
		}
		p.Roles, _ = s.getRolesForProfile(ctx, p.ID)
		profiles = append(profiles, p)
	}
	return profiles, nil
}

func (s *Service) GetProfile(ctx context.Context, id uuid.UUID) (*ProfileResponse, error) {
	var p ProfileResponse
	err := s.pool.QueryRow(ctx, `
		SELECT p.id, p.name, p.code, p.created_at_utc, p.updated_at_utc,
		       (SELECT COUNT(*) FROM users u WHERE u.profile_id = p.id) AS user_count
		FROM profiles p WHERE p.id = $1
	`, id).Scan(&p.ID, &p.Name, &p.Code, &p.CreatedAt, &p.UpdatedAt, &p.UserCount)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("PROFILE_NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get profile: %w", err)
	}
	p.Roles, _ = s.getRolesForProfile(ctx, p.ID)
	return &p, nil
}

func (s *Service) CreateProfile(ctx context.Context, req CreateProfileRequest) (*ProfileResponse, error) {
	var p ProfileResponse
	err := s.pool.QueryRow(ctx, `
		INSERT INTO profiles (id, name, code, created_at_utc, updated_at_utc)
		VALUES ($1, $2, $3, now(), now())
		RETURNING id, name, code, created_at_utc, updated_at_utc
	`, uuid.New(), req.Name, req.Code).Scan(
		&p.ID, &p.Name, &p.Code, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create profile: %w", err)
	}
	p.UserCount = 0
	p.Roles = []RoleEntry{}
	return &p, nil
}

func (s *Service) UpdateProfile(ctx context.Context, id uuid.UUID, req UpdateProfileRequest) (*ProfileResponse, error) {
	var p ProfileResponse
	err := s.pool.QueryRow(ctx, `
		UPDATE profiles SET name = $2, code = $3, updated_at_utc = now()
		WHERE id = $1
		RETURNING id, name, code, created_at_utc, updated_at_utc
	`, id, req.Name, req.Code).Scan(
		&p.ID, &p.Name, &p.Code, &p.CreatedAt, &p.UpdatedAt,
	)
	if err == nil {
		p.UserCount, _ = s.getUserCountForProfile(ctx, id)
	}
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("PROFILE_NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("update profile: %w", err)
	}
	p.Roles, _ = s.getRolesForProfile(ctx, p.ID)
	return &p, nil
}

func (s *Service) DeleteProfile(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM profiles WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete profile: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("PROFILE_NOT_FOUND")
	}
	if err := s.store.ReloadAll(ctx, s.pool); err != nil {
		return fmt.Errorf("reload rbac: %w", err)
	}
	return nil
}

func (s *Service) AssignRoleToProfile(ctx context.Context, profileID uuid.UUID, req AssignRoleRequest) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO profile_role_assignments (id, profile_id, role_id, active, created_at_utc)
		VALUES ($1, $2, $3, true, now())
		ON CONFLICT (profile_id, role_id) DO NOTHING
	`, uuid.New(), profileID, req.RoleID)
	if err != nil {
		return fmt.Errorf("assign role: %w", err)
	}
	if err := s.store.ReloadAll(ctx, s.pool); err != nil {
		return fmt.Errorf("reload rbac: %w", err)
	}
	return nil
}

func (s *Service) RemoveRoleFromProfile(ctx context.Context, profileID, roleID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `
		DELETE FROM profile_role_assignments WHERE profile_id = $1 AND role_id = $2
	`, profileID, roleID)
	if err != nil {
		return fmt.Errorf("remove role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("ASSIGNMENT_NOT_FOUND")
	}
	if err := s.store.ReloadAll(ctx, s.pool); err != nil {
		return fmt.Errorf("reload rbac: %w", err)
	}
	return nil
}

// Users

func (s *Service) AssignProfileToUser(ctx context.Context, userID, profileID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `UPDATE users SET profile_id = $2 WHERE id = $1`, userID, profileID)
	if err != nil {
		return fmt.Errorf("assign profile: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("USER_NOT_FOUND")
	}
	return nil
}

// Helpers

func (s *Service) getResourcesForRole(ctx context.Context, roleID uuid.UUID) ([]ResourceEntry, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT r.id, r.code FROM role_resources rr
		JOIN resources r ON r.id = rr.resource_id
		WHERE rr.role_id = $1 ORDER BY r.code
	`, roleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var resources []ResourceEntry
	for rows.Next() {
		var r ResourceEntry
		if err := rows.Scan(&r.ID, &r.Code); err != nil {
			return nil, err
		}
		resources = append(resources, r)
	}
	return resources, nil
}

func (s *Service) getUserCountForProfile(ctx context.Context, profileID uuid.UUID) (int, error) {
	var count int
	err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE profile_id = $1`, profileID).Scan(&count)
	return count, err
}

func (s *Service) getRolesForProfile(ctx context.Context, profileID uuid.UUID) ([]RoleEntry, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT r.id, r.code, r.name FROM profile_role_assignments pra
		JOIN roles r ON r.id = pra.role_id
		WHERE pra.profile_id = $1 AND pra.active = true ORDER BY r.code
	`, profileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roles []RoleEntry
	for rows.Next() {
		var r RoleEntry
		if err := rows.Scan(&r.ID, &r.Code, &r.Name); err != nil {
			return nil, err
		}
		roles = append(roles, r)
	}
	return roles, nil
}
