package serviceaccount

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lcdpc/lcdpc-go/internal/auth"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) List(ctx context.Context) ([]ServiceAccountResponse, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT sa.id, sa.name, sa.username, sa.profile_id, p.name AS profile_name,
		       sa.token_expiry_hours, sa.is_active, sa.created_at_utc, sa.updated_at_utc
		FROM service_accounts sa
		JOIN profiles p ON p.id = sa.profile_id
		WHERE sa.deleted_at_utc IS NULL
		ORDER BY sa.created_at_utc DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list service accounts: %w", err)
	}
	defer rows.Close()

	var items []ServiceAccountResponse
	for rows.Next() {
		var sa ServiceAccountResponse
		if err := rows.Scan(&sa.ID, &sa.Name, &sa.Username, &sa.ProfileID, &sa.ProfileName,
			&sa.TokenExpiryHours, &sa.IsActive, &sa.CreatedAtUTC, &sa.UpdatedAtUTC); err != nil {
			return nil, fmt.Errorf("scan service account: %w", err)
		}
		items = append(items, sa)
	}
	return items, nil
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*ServiceAccountResponse, error) {
	var sa ServiceAccountResponse
	err := s.pool.QueryRow(ctx, `
		SELECT sa.id, sa.name, sa.username, sa.profile_id, p.name AS profile_name,
		       sa.token_expiry_hours, sa.is_active, sa.created_at_utc, sa.updated_at_utc
		FROM service_accounts sa
		JOIN profiles p ON p.id = sa.profile_id
		WHERE sa.id = $1 AND sa.deleted_at_utc IS NULL
	`, id).Scan(&sa.ID, &sa.Name, &sa.Username, &sa.ProfileID, &sa.ProfileName,
		&sa.TokenExpiryHours, &sa.IsActive, &sa.CreatedAtUTC, &sa.UpdatedAtUTC)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("SERVICE_ACCOUNT_NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get service account: %w", err)
	}
	return &sa, nil
}

func (s *Service) GetByUsername(ctx context.Context, username string) (*ServiceAccountResponse, error) {
	var sa ServiceAccountResponse
	err := s.pool.QueryRow(ctx, `
		SELECT sa.id, sa.name, sa.username, sa.profile_id, p.name AS profile_name,
		       sa.token_expiry_hours, sa.is_active, sa.created_at_utc, sa.updated_at_utc
		FROM service_accounts sa
		JOIN profiles p ON p.id = sa.profile_id
		WHERE sa.username = $1 AND sa.deleted_at_utc IS NULL
	`, username).Scan(&sa.ID, &sa.Name, &sa.Username, &sa.ProfileID, &sa.ProfileName,
		&sa.TokenExpiryHours, &sa.IsActive, &sa.CreatedAtUTC, &sa.UpdatedAtUTC)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get service account by username: %w", err)
	}
	return &sa, nil
}

func (s *Service) GetPasswordHash(ctx context.Context, id uuid.UUID) (string, error) {
	var hash string
	err := s.pool.QueryRow(ctx, `SELECT password_hash FROM service_accounts WHERE id = $1 AND deleted_at_utc IS NULL`, id).Scan(&hash)
	if err == pgx.ErrNoRows {
		return "", fmt.Errorf("SERVICE_ACCOUNT_NOT_FOUND")
	}
	if err != nil {
		return "", fmt.Errorf("get password hash: %w", err)
	}
	return hash, nil
}

func (s *Service) Create(ctx context.Context, req CreateRequest) (*CreateResult, error) {
	if req.Name == "" || req.Username == "" || req.Password == "" {
		return nil, fmt.Errorf("name, username and password are required")
	}

	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	tokenExpiry := 12
	if req.TokenExpiryHours != nil && *req.TokenExpiryHours > 0 {
		tokenExpiry = *req.TokenExpiryHours
	}

	now := time.Now().UTC()
	var sa ServiceAccountResponse
	err = s.pool.QueryRow(ctx, `
		INSERT INTO service_accounts (id, name, username, password_hash, profile_id, token_expiry_hours, is_active, created_at_utc, updated_at_utc)
		VALUES ($1, $2, $3, $4, $5, $6, true, $7, $7)
		RETURNING id, name, username, profile_id, token_expiry_hours, is_active, created_at_utc, updated_at_utc
	`, uuid.New(), req.Name, req.Username, passwordHash, req.ProfileID, tokenExpiry, now).Scan(
		&sa.ID, &sa.Name, &sa.Username, &sa.ProfileID, &sa.TokenExpiryHours, &sa.IsActive, &sa.CreatedAtUTC, &sa.UpdatedAtUTC,
	)
	if err != nil {
		return nil, fmt.Errorf("create service account: %w", err)
	}

	var profileName string
	s.pool.QueryRow(ctx, `SELECT name FROM profiles WHERE id = $1`, req.ProfileID).Scan(&profileName)
	sa.ProfileName = profileName

	return &CreateResult{
		ServiceAccountResponse: sa,
		RawPassword:            req.Password,
	}, nil
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, req UpdateRequest) (*ServiceAccountResponse, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}

	tokenExpiry := 12
	if req.TokenExpiryHours != nil && *req.TokenExpiryHours > 0 {
		tokenExpiry = *req.TokenExpiryHours
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	var sa ServiceAccountResponse
	err := s.pool.QueryRow(ctx, `
		UPDATE service_accounts
		SET name = $2, is_active = $3, profile_id = $4, token_expiry_hours = $5, updated_at_utc = now()
		WHERE id = $1 AND deleted_at_utc IS NULL
		RETURNING id, name, username, profile_id, token_expiry_hours, is_active, created_at_utc, updated_at_utc
	`, id, req.Name, isActive, req.ProfileID, tokenExpiry).Scan(
		&sa.ID, &sa.Name, &sa.Username, &sa.ProfileID, &sa.TokenExpiryHours, &sa.IsActive, &sa.CreatedAtUTC, &sa.UpdatedAtUTC,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("SERVICE_ACCOUNT_NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("update service account: %w", err)
	}

	var profileName string
	s.pool.QueryRow(ctx, `SELECT name FROM profiles WHERE id = $1`, req.ProfileID).Scan(&profileName)
	sa.ProfileName = profileName

	return &sa, nil
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `UPDATE service_accounts SET deleted_at_utc = now() WHERE id = $1 AND deleted_at_utc IS NULL`, id)
	if err != nil {
		return fmt.Errorf("delete service account: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("SERVICE_ACCOUNT_NOT_FOUND")
	}
	return nil
}
