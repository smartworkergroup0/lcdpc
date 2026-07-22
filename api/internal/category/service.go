package category

import (
	"context"
	"fmt"
	"strings"
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

type Category struct {
	CategoryID   uuid.UUID `json:"category_id"`
	Name         string    `json:"name"`
	Code         string    `json:"code"`
	CreatedAtUtc time.Time `json:"created_at_utc"`
	UpdatedAtUtc time.Time `json:"updated_at_utc"`
}

type CreateCategoryRequest struct {
	Name string `json:"name" validate:"required"`
	Code string `json:"code" validate:"required"`
}

func (s *Service) Create(ctx context.Context, req CreateCategoryRequest) (*Category, error) {
	req.Code = strings.ToUpper(req.Code)
	c := &Category{}
	err := s.pool.QueryRow(ctx, `
		INSERT INTO categories (category_id, name, code, created_at_utc, updated_at_utc)
		VALUES ($1, $2, $3, now(), now())
		RETURNING category_id, name, code, created_at_utc, updated_at_utc
	`, uuid.New(), req.Name, req.Code).Scan(
		&c.CategoryID, &c.Name, &c.Code, &c.CreatedAtUtc, &c.UpdatedAtUtc,
	)
	if err != nil {
		return nil, fmt.Errorf("create category: %w", err)
	}
	return c, nil
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*Category, error) {
	c := &Category{}
	err := s.pool.QueryRow(ctx, `
		SELECT category_id, name, code, created_at_utc, updated_at_utc
		FROM categories WHERE category_id = $1
	`, id).Scan(
		&c.CategoryID, &c.Name, &c.Code, &c.CreatedAtUtc, &c.UpdatedAtUtc,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get category: %w", err)
	}
	return c, nil
}

func (s *Service) List(ctx context.Context) ([]Category, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT category_id, name, code, created_at_utc, updated_at_utc
		FROM categories ORDER BY name
	`)
	if err != nil {
		return nil, fmt.Errorf("list categories: %w", err)
	}
	defer rows.Close()

	categories := make([]Category, 0)
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.CategoryID, &c.Name, &c.Code, &c.CreatedAtUtc, &c.UpdatedAtUtc); err != nil {
			return nil, fmt.Errorf("scan category: %w", err)
		}
		categories = append(categories, c)
	}
	return categories, nil
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, req CreateCategoryRequest) (*Category, error) {
	req.Code = strings.ToUpper(req.Code)
	c := &Category{}
	err := s.pool.QueryRow(ctx, `
		UPDATE categories SET name = $2, code = $3, updated_at_utc = now()
		WHERE category_id = $1
		RETURNING category_id, name, code, created_at_utc, updated_at_utc
	`, id, req.Name, req.Code).Scan(
		&c.CategoryID, &c.Name, &c.Code, &c.CreatedAtUtc, &c.UpdatedAtUtc,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("update category: %w", err)
	}
	return c, nil
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM categories WHERE category_id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete category: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("NOT_FOUND")
	}
	return nil
}
