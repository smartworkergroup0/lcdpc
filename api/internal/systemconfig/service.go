package systemconfig

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

type SystemConfig struct {
	ID                 string  `json:"id"`
	LogoPath           *string `json:"logo_path"`
	IconPath           *string `json:"icon_path"`
	PageName           string  `json:"page_name"`
	Title              string  `json:"title"`
	ShowPriceInCatalog bool    `json:"show_price_in_catalog"`
	NegativeStock      bool    `json:"negative_stock"`
	Active             bool    `json:"active"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type CreateSystemConfigRequest struct {
	LogoPath           *string `json:"logo_path"`
	IconPath           *string `json:"icon_path"`
	PageName           string  `json:"page_name" validate:"required"`
	Title              string  `json:"title" validate:"required"`
	ShowPriceInCatalog bool    `json:"show_price_in_catalog"`
	NegativeStock      bool    `json:"negative_stock"`
	Active             bool    `json:"active"`
}

type UpdateSystemConfigRequest struct {
	LogoPath           *string `json:"logo_path"`
	IconPath           *string `json:"icon_path"`
	PageName           *string `json:"page_name"`
	Title              *string `json:"title"`
	ShowPriceInCatalog *bool   `json:"show_price_in_catalog"`
	NegativeStock      *bool   `json:"negative_stock"`
	Active             *bool   `json:"active"`
}

func (s *Service) Create(ctx context.Context, req CreateSystemConfigRequest) (*SystemConfig, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if req.Active {
		if _, err := tx.Exec(ctx, `UPDATE system_config SET active = false, updated_at = now()`); err != nil {
			return nil, fmt.Errorf("deactivate all: %w", err)
		}
	}

	c := &SystemConfig{}
	err = tx.QueryRow(ctx, `
		INSERT INTO system_config (logo_path, icon_path, page_name, title, show_price_in_catalog, negative_stock, active)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, logo_path, icon_path, page_name, title, show_price_in_catalog, negative_stock, active, created_at, updated_at
	`, req.LogoPath, req.IconPath, req.PageName, req.Title, req.ShowPriceInCatalog, req.NegativeStock, req.Active).Scan(
		&c.ID, &c.LogoPath, &c.IconPath, &c.PageName, &c.Title, &c.ShowPriceInCatalog, &c.NegativeStock, &c.Active, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create system config: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}
	return c, nil
}

func (s *Service) GetActive(ctx context.Context) (*SystemConfig, error) {
	c := &SystemConfig{}
	err := s.pool.QueryRow(ctx, `
		SELECT id, logo_path, icon_path, page_name, title, show_price_in_catalog, negative_stock, active, created_at, updated_at
		FROM system_config WHERE active = true LIMIT 1
	`).Scan(
		&c.ID, &c.LogoPath, &c.IconPath, &c.PageName, &c.Title, &c.ShowPriceInCatalog, &c.NegativeStock, &c.Active, &c.CreatedAt, &c.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return &SystemConfig{
			PageName:           "LCDPC",
			Title:              "LCDPC",
			ShowPriceInCatalog: true,
			NegativeStock:      false,
			Active:             false,
		}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get active system config: %w", err)
	}
	return c, nil
}

func (s *Service) GetNegativeStock(ctx context.Context) (bool, error) {
	var negativeStock bool
	err := s.pool.QueryRow(ctx, `
		SELECT negative_stock FROM system_config WHERE active = true LIMIT 1
	`).Scan(&negativeStock)
	if err == pgx.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("get negative_stock: %w", err)
	}
	return negativeStock, nil
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*SystemConfig, error) {
	c := &SystemConfig{}
	err := s.pool.QueryRow(ctx, `
		SELECT id, logo_path, icon_path, page_name, title, show_price_in_catalog, negative_stock, active, created_at, updated_at
		FROM system_config WHERE id = $1
	`, id).Scan(
		&c.ID, &c.LogoPath, &c.IconPath, &c.PageName, &c.Title, &c.ShowPriceInCatalog, &c.NegativeStock, &c.Active, &c.CreatedAt, &c.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get system config by id: %w", err)
	}
	return c, nil
}

func (s *Service) List(ctx context.Context) ([]SystemConfig, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, logo_path, icon_path, page_name, title, show_price_in_catalog, negative_stock, active, created_at, updated_at
		FROM system_config ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list system configs: %w", err)
	}
	defer rows.Close()

	configs := make([]SystemConfig, 0)
	for rows.Next() {
		var c SystemConfig
		if err := rows.Scan(&c.ID, &c.LogoPath, &c.IconPath, &c.PageName, &c.Title, &c.ShowPriceInCatalog, &c.NegativeStock, &c.Active, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan system config: %w", err)
		}
		configs = append(configs, c)
	}
	return configs, nil
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, req UpdateSystemConfigRequest) (*SystemConfig, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if req.Active != nil && *req.Active {
		if _, err := tx.Exec(ctx, `UPDATE system_config SET active = false, updated_at = now()`); err != nil {
			return nil, fmt.Errorf("deactivate all: %w", err)
		}
	}

	c := &SystemConfig{}
	err = tx.QueryRow(ctx, `
		UPDATE system_config SET
			logo_path = COALESCE($2, logo_path),
			icon_path = COALESCE($3, icon_path),
			page_name = COALESCE($4, page_name),
			title = COALESCE($5, title),
			show_price_in_catalog = COALESCE($6, show_price_in_catalog),
			negative_stock = COALESCE($7, negative_stock),
			active = COALESCE($8, active),
			updated_at = now()
		WHERE id = $1
		RETURNING id, logo_path, icon_path, page_name, title, show_price_in_catalog, negative_stock, active, created_at, updated_at
	`, id, req.LogoPath, req.IconPath, req.PageName, req.Title, req.ShowPriceInCatalog, req.NegativeStock, req.Active).Scan(
		&c.ID, &c.LogoPath, &c.IconPath, &c.PageName, &c.Title, &c.ShowPriceInCatalog, &c.NegativeStock, &c.Active, &c.CreatedAt, &c.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("update system config: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}
	return c, nil
}
