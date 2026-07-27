package session

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) List(ctx context.Context, branchID *uuid.UUID) ([]AssistantServiceAccount, error) {
	query := `
		SELECT a.id, a.username, a.branch_id, b.store_name AS branch_name,
		       a.is_active, a.created_at_utc, a.updated_at_utc
		FROM assistant_service_accounts a
		JOIN branches b ON b.id = a.branch_id
		WHERE a.deleted_at_utc IS NULL`
	args := []interface{}{}

	if branchID != nil {
		query += " AND a.branch_id = $1"
		args = append(args, *branchID)
	}
	query += " ORDER BY a.created_at_utc DESC"

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list assistant sessions: %w", err)
	}
	defer rows.Close()

	var items []AssistantServiceAccount
	for rows.Next() {
		var a AssistantServiceAccount
		if err := rows.Scan(&a.ID, &a.Username, &a.BranchID, &a.BranchName,
			&a.IsActive, &a.CreatedAtUTC, &a.UpdatedAtUTC); err != nil {
			return nil, fmt.Errorf("scan assistant session: %w", err)
		}
		items = append(items, a)
	}
	return items, nil
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*AssistantServiceAccount, error) {
	var a AssistantServiceAccount
	err := s.pool.QueryRow(ctx, `
		SELECT a.id, a.username, a.branch_id, b.store_name AS branch_name,
		       a.is_active, a.created_at_utc, a.updated_at_utc
		FROM assistant_service_accounts a
		JOIN branches b ON b.id = a.branch_id
		WHERE a.id = $1 AND a.deleted_at_utc IS NULL
	`, id).Scan(&a.ID, &a.Username, &a.BranchID, &a.BranchName,
		&a.IsActive, &a.CreatedAtUTC, &a.UpdatedAtUTC)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("ASSISTANT_SESSION_NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get assistant session: %w", err)
	}
	return &a, nil
}

func (s *Service) GetCredentialsByID(ctx context.Context, id uuid.UUID) (username, password string, err error) {
	err = s.pool.QueryRow(ctx, `
		SELECT username, password FROM assistant_service_accounts
		WHERE id = $1 AND deleted_at_utc IS NULL AND is_active = true
	`, id).Scan(&username, &password)
	if err == pgx.ErrNoRows {
		return "", "", fmt.Errorf("ASSISTANT_SESSION_NOT_FOUND")
	}
	if err != nil {
		return "", "", fmt.Errorf("get assistant session credentials: %w", err)
	}
	return username, password, nil
}

func (s *Service) Create(ctx context.Context, req CreateRequest) (*AssistantServiceAccount, error) {
	if req.Username == "" || req.Password == "" {
		return nil, fmt.Errorf("username and password are required")
	}

	now := time.Now().UTC()
	var a AssistantServiceAccount
	err := s.pool.QueryRow(ctx, `
		INSERT INTO assistant_service_accounts (id, username, password, branch_id, is_active, created_at_utc, updated_at_utc)
		VALUES ($1, $2, $3, $4, true, $5, $5)
		RETURNING id, username, branch_id, is_active, created_at_utc, updated_at_utc
	`, uuid.New(), req.Username, req.Password, req.BranchID, now).Scan(
		&a.ID, &a.Username, &a.BranchID, &a.IsActive, &a.CreatedAtUTC, &a.UpdatedAtUTC,
	)
	if err != nil {
		return nil, fmt.Errorf("create assistant session: %w", err)
	}

	var branchName string
	s.pool.QueryRow(ctx, `SELECT store_name FROM branches WHERE id = $1`, req.BranchID).Scan(&branchName)
	a.BranchName = branchName

	return &a, nil
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, req UpdateRequest) (*AssistantServiceAccount, error) {
	if req.Username == "" {
		return nil, fmt.Errorf("username is required")
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	var err error
	if req.Password != nil && *req.Password != "" {
		_, err = s.pool.Exec(ctx, `
			UPDATE assistant_service_accounts
			SET username = $2, password = $3, branch_id = $4, is_active = $5, updated_at_utc = now()
			WHERE id = $1 AND deleted_at_utc IS NULL
		`, id, req.Username, *req.Password, req.BranchID, isActive)
	} else {
		_, err = s.pool.Exec(ctx, `
			UPDATE assistant_service_accounts
			SET username = $2, branch_id = $3, is_active = $4, updated_at_utc = now()
			WHERE id = $1 AND deleted_at_utc IS NULL
		`, id, req.Username, req.BranchID, isActive)
	}
	if err != nil {
		return nil, fmt.Errorf("update assistant session: %w", err)
	}

	return s.GetByID(ctx, id)
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE assistant_service_accounts SET deleted_at_utc = now()
		WHERE id = $1 AND deleted_at_utc IS NULL
	`, id)
	if err != nil {
		return fmt.Errorf("delete assistant session: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("ASSISTANT_SESSION_NOT_FOUND")
	}
	return nil
}
