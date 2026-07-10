package brand

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

type Brand struct {
	ID           uuid.UUID `json:"id"`
	Name         string    `json:"name"`
	Code         string    `json:"code"`
	CreatedAtUtc time.Time `json:"created_at_utc"`
	UpdatedAtUtc time.Time `json:"updated_at_utc"`
}

type CreateBrandRequest struct {
	Name string `json:"name" validate:"required"`
	Code string `json:"code" validate:"required"`
}

func (s *Service) Create(ctx context.Context, req CreateBrandRequest) (*Brand, error) {
	b := &Brand{}
	err := s.pool.QueryRow(ctx, `
		INSERT INTO brands (id, name, code, created_at_utc, updated_at_utc)
		VALUES ($1, $2, $3, now(), now())
		RETURNING id, name, code, created_at_utc, updated_at_utc
	`, uuid.New(), req.Name, req.Code).Scan(&b.ID, &b.Name, &b.Code, &b.CreatedAtUtc, &b.UpdatedAtUtc)
	if err != nil {
		return nil, fmt.Errorf("create brand: %w", err)
	}
	return b, nil
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*Brand, error) {
	b := &Brand{}
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, code, created_at_utc, updated_at_utc FROM brands WHERE id = $1
	`, id).Scan(&b.ID, &b.Name, &b.Code, &b.CreatedAtUtc, &b.UpdatedAtUtc)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get brand: %w", err)
	}
	return b, nil
}

func (s *Service) List(ctx context.Context) ([]Brand, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, name, code, created_at_utc, updated_at_utc FROM brands ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list brands: %w", err)
	}
	defer rows.Close()

	brands := make([]Brand, 0)
	for rows.Next() {
		var b Brand
		if err := rows.Scan(&b.ID, &b.Name, &b.Code, &b.CreatedAtUtc, &b.UpdatedAtUtc); err != nil {
			return nil, fmt.Errorf("scan brand: %w", err)
		}
		brands = append(brands, b)
	}
	return brands, nil
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, req CreateBrandRequest) (*Brand, error) {
	b := &Brand{}
	err := s.pool.QueryRow(ctx, `
		UPDATE brands SET name = $2, code = $3, updated_at_utc = now()
		WHERE id = $1
		RETURNING id, name, code, created_at_utc, updated_at_utc
	`, id, req.Name, req.Code).Scan(&b.ID, &b.Name, &b.Code, &b.CreatedAtUtc, &b.UpdatedAtUtc)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("update brand: %w", err)
	}
	return b, nil
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM brands WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete brand: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("NOT_FOUND")
	}
	return nil
}
