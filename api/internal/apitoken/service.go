package apitoken

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"

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

func (s *Service) List(ctx context.Context) ([]ApiTokenResponse, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, name, is_active, created_at_utc FROM api_tokens ORDER BY created_at_utc DESC`)
	if err != nil {
		return nil, fmt.Errorf("list api tokens: %w", err)
	}
	defer rows.Close()

	var tokens []ApiTokenResponse
	for rows.Next() {
		var t ApiTokenResponse
		if err := rows.Scan(&t.ID, &t.Name, &t.IsActive, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan api token: %w", err)
		}
		tokens = append(tokens, t)
	}
	return tokens, nil
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*ApiTokenResponse, error) {
	var t ApiTokenResponse
	err := s.pool.QueryRow(ctx, `SELECT id, name, is_active, created_at_utc FROM api_tokens WHERE id = $1`, id).Scan(
		&t.ID, &t.Name, &t.IsActive, &t.CreatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("API_TOKEN_NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get api token: %w", err)
	}
	return &t, nil
}

func (s *Service) Create(ctx context.Context, req CreateApiTokenRequest) (*CreateApiTokenResult, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}
	rawToken := hex.EncodeToString(tokenBytes)
	tokenHash := sha256Hex(rawToken)

	var t ApiTokenResponse
	err := s.pool.QueryRow(ctx, `
		INSERT INTO api_tokens (id, name, token_hash, is_active, created_at_utc)
		VALUES ($1, $2, $3, true, now())
		RETURNING id, name, is_active, created_at_utc
	`, uuid.New(), req.Name, tokenHash).Scan(&t.ID, &t.Name, &t.IsActive, &t.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create api token: %w", err)
	}

	return &CreateApiTokenResult{
		ApiTokenResponse: t,
		RawToken:         rawToken,
	}, nil
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, req UpdateApiTokenRequest) (*ApiTokenResponse, error) {
	var t ApiTokenResponse
	err := s.pool.QueryRow(ctx, `
		UPDATE api_tokens SET name = $2, is_active = $3
		WHERE id = $1
		RETURNING id, name, is_active, created_at_utc
	`, id, req.Name, *req.IsActive).Scan(&t.ID, &t.Name, &t.IsActive, &t.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("API_TOKEN_NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("update api token: %w", err)
	}
	return &t, nil
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM api_tokens WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete api token: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("API_TOKEN_NOT_FOUND")
	}
	return nil
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}
