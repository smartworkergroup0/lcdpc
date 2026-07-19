package user

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	defaultLimit = 10
	maxLimit     = 100
)

type UserModel struct {
	ID               uuid.UUID  `json:"id"`
	Email            string     `json:"email"`
	PersonID         *uuid.UUID `json:"person_id,omitempty"`
	Name             *string    `json:"name"`
	IdentityDocument *string    `json:"identity_document,omitempty"`
	WhatsAppPhone    *string    `json:"whatsapp_phone,omitempty"`
	FullAddress      *string    `json:"full_address,omitempty"`
	IsClient         bool       `json:"is_client"`
	IsStaff          bool       `json:"is_staff"`
	Status           string     `json:"status"`
	CreatedAt        time.Time  `json:"created_at_utc"`
}

type UpdateUserRequest struct {
	Email         string `json:"email"`
	Name          string `json:"name"`
	WhatsAppPhone string `json:"whatsapp_phone"`
	FullAddress   string `json:"full_address"`
}

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) List(ctx context.Context, limit, offset int) ([]UserModel, int, error) {
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}
	if offset < 0 {
		offset = 0
	}

	var totalCount int
	err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&totalCount)
	if err != nil {
		return nil, 0, fmt.Errorf("count users: %w", err)
	}

	rows, err := s.pool.Query(ctx, `
		SELECT u.id, u.email, per.id, per.name, per.identity_document, per.whatsapp_phone, per.full_address, COALESCE(per.is_client, false), COALESCE(per.is_staff, false), u.status, u.created_at_utc
		FROM users u
		LEFT JOIN persons per ON per.id = u.person_id
		ORDER BY u.created_at_utc DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	users := make([]UserModel, 0)
	for rows.Next() {
		var u UserModel
		if err := rows.Scan(&u.ID, &u.Email, &u.PersonID, &u.Name, &u.IdentityDocument, &u.WhatsAppPhone, &u.FullAddress, &u.IsClient, &u.IsStaff, &u.Status, &u.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}
	return users, totalCount, nil
}

func (s *Service) GetByDocument(ctx context.Context, document string) (*UserModel, error) {
	var u UserModel
	err := s.pool.QueryRow(ctx, `
		SELECT u.id, u.email, per.id, per.name, per.identity_document, per.whatsapp_phone, per.full_address, COALESCE(per.is_client, false), COALESCE(per.is_staff, false), u.status, u.created_at_utc
		FROM users u
		LEFT JOIN persons per ON per.id = u.person_id
		WHERE per.identity_document = $1
	`, document).Scan(&u.ID, &u.Email, &u.PersonID, &u.Name, &u.IdentityDocument, &u.WhatsAppPhone, &u.FullAddress, &u.IsClient, &u.IsStaff, &u.Status, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("user not found by document: %w", err)
	}
	return &u, nil
}

func (s *Service) Update(ctx context.Context, userID uuid.UUID, req UpdateUserRequest) (*UserModel, error) {
	if req.Email == "" {
		return nil, fmt.Errorf("email is required")
	}
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if req.WhatsAppPhone == "" {
		return nil, fmt.Errorf("whatsapp_phone is required")
	}
	if req.FullAddress == "" {
		return nil, fmt.Errorf("full_address is required")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var personID uuid.UUID
	err = tx.QueryRow(ctx, `SELECT COALESCE(person_id, '00000000-0000-0000-0000-000000000000'::uuid) FROM users WHERE id = $1`, userID).Scan(&personID)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	if personID == uuid.Nil {
		return nil, fmt.Errorf("PERSON_NOT_LINKED")
	}

	if _, err = tx.Exec(ctx, `UPDATE users SET email = $2 WHERE id = $1`, userID, req.Email); err != nil {
		return nil, fmt.Errorf("update email: %w", err)
	}
	if _, err = tx.Exec(ctx, `
		UPDATE persons
		SET name = $2,
			whatsapp_phone = $3,
			full_address = $4,
			updated_at_utc = now()
		WHERE id = $1
	`, personID, req.Name, req.WhatsAppPhone, req.FullAddress); err != nil {
		return nil, fmt.Errorf("update person: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	var updated UserModel
	err = s.pool.QueryRow(ctx, `
		SELECT u.id, u.email, per.id, per.name, per.identity_document, per.whatsapp_phone, per.full_address, COALESCE(per.is_client, false), COALESCE(per.is_staff, false), u.status, u.created_at_utc
		FROM users u
		LEFT JOIN persons per ON per.id = u.person_id
		WHERE u.id = $1
	`, userID).Scan(&updated.ID, &updated.Email, &updated.PersonID, &updated.Name, &updated.IdentityDocument, &updated.WhatsAppPhone, &updated.FullAddress, &updated.IsClient, &updated.IsStaff, &updated.Status, &updated.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get updated user: %w", err)
	}
	return &updated, nil
}

func (s *Service) Search(ctx context.Context, query string, limit, offset int) ([]UserModel, int, error) {
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}
	if offset < 0 {
		offset = 0
	}

	countQuery := `
		SELECT COUNT(*)
		FROM users u
		LEFT JOIN persons per ON per.id = u.person_id
		WHERE u.email ILIKE '%' || $1 || '%'
		   OR per.name ILIKE '%' || $1 || '%'`

	var totalCount int
	err := s.pool.QueryRow(ctx, countQuery, query).Scan(&totalCount)
	if err != nil {
		return nil, 0, fmt.Errorf("count users: %w", err)
	}

	dataQuery := `
		SELECT u.id, u.email, per.id, per.name, per.identity_document, per.whatsapp_phone, per.full_address, COALESCE(per.is_client, false), COALESCE(per.is_staff, false), u.status, u.created_at_utc
		FROM users u
		LEFT JOIN persons per ON per.id = u.person_id
		WHERE u.email ILIKE '%' || $1 || '%'
		   OR per.name ILIKE '%' || $1 || '%'
		   OR per.whatsapp_phone ILIKE '%' || $1 || '%'
		   OR per.full_address ILIKE '%' || $1 || '%'
		ORDER BY u.created_at_utc DESC
		LIMIT $2 OFFSET $3`

	rows, err := s.pool.Query(ctx, dataQuery, query, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("search users: %w", err)
	}
	defer rows.Close()

	users := make([]UserModel, 0)
	for rows.Next() {
		var u UserModel
		if err := rows.Scan(&u.ID, &u.Email, &u.PersonID, &u.Name, &u.IdentityDocument, &u.WhatsAppPhone, &u.FullAddress, &u.IsClient, &u.IsStaff, &u.Status, &u.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}
	return users, totalCount, nil
}

func (s *Service) GetByID(ctx context.Context, userID uuid.UUID) (*UserModel, error) {
	var u UserModel
	err := s.pool.QueryRow(ctx, `
		SELECT u.id, u.email, per.id, per.name, per.identity_document, per.whatsapp_phone, per.full_address, COALESCE(per.is_client, false), COALESCE(per.is_staff, false), u.status, u.created_at_utc
		FROM users u
		LEFT JOIN persons per ON per.id = u.person_id
		WHERE u.id = $1
	`, userID).Scan(&u.ID, &u.Email, &u.PersonID, &u.Name, &u.IdentityDocument, &u.WhatsAppPhone, &u.FullAddress, &u.IsClient, &u.IsStaff, &u.Status, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	return &u, nil
}
