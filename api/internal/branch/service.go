package branch

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

type Schedule struct {
	ID         uuid.UUID `json:"id"`
	BranchID   uuid.UUID `json:"branch_id"`
	DayOfWeek  int16     `json:"day_of_week"`
	StartTime  string    `json:"start_time"`
	EndTime    string    `json:"end_time"`
	CreatedAtUtc time.Time `json:"created_at_utc"`
	UpdatedAtUtc time.Time `json:"updated_at_utc"`
}

type Branch struct {
	ID                    uuid.UUID  `json:"id"`
	Code                  string     `json:"code"`
	StoreName             string     `json:"store_name"`
	TaxID                 string     `json:"tax_id"`
	Address               string     `json:"address"`
	ContactPhone          string     `json:"contact_phone"`
	SecondaryContactPhone *string    `json:"secondary_contact_phone"`
	Schedules             []Schedule `json:"schedules"`
	CreatedAtUtc           time.Time  `json:"created_at_utc"`
	UpdatedAtUtc           time.Time  `json:"updated_at_utc"`
}

type CreateScheduleRequest struct {
	DayOfWeek int16  `json:"day_of_week" validate:"required,gte=0,lte=6"`
	StartTime string `json:"start_time" validate:"required"`
	EndTime   string `json:"end_time" validate:"required"`
}

type CreateBranchRequest struct {
	Code                  string                 `json:"code" validate:"required"`
	StoreName             string                 `json:"store_name" validate:"required"`
	TaxID                 string                 `json:"tax_id" validate:"required"`
	Address               string                 `json:"address" validate:"required"`
	ContactPhone          string                 `json:"contact_phone" validate:"required"`
	SecondaryContactPhone string                 `json:"secondary_contact_phone"`
	Schedules             []CreateScheduleRequest `json:"schedules" validate:"required,min=1"`
}

func (s *Service) Create(ctx context.Context, req CreateBranchRequest) (*Branch, error) {
	var secPhone *string
	if req.SecondaryContactPhone != "" {
		secPhone = &req.SecondaryContactPhone
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	branch := &Branch{}
	err = tx.QueryRow(ctx, `
		INSERT INTO branches (id, code, store_name, tax_id, address, contact_phone, secondary_contact_phone, created_at_utc, updated_at_utc)
		VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
		RETURNING id, code, store_name, tax_id, address, contact_phone, secondary_contact_phone, created_at_utc, updated_at_utc
	`, uuid.New(), req.Code, req.StoreName, req.TaxID, req.Address, req.ContactPhone, secPhone).Scan(
		&branch.ID, &branch.Code, &branch.StoreName, &branch.TaxID, &branch.Address, &branch.ContactPhone,
		&branch.SecondaryContactPhone, &branch.CreatedAtUtc, &branch.UpdatedAtUtc,
	)
	if err != nil {
		return nil, fmt.Errorf("insert branch: %w", err)
	}

	branch.Schedules = make([]Schedule, 0, len(req.Schedules))
	for _, sr := range req.Schedules {
		sch := Schedule{}
		err = tx.QueryRow(ctx, `
			INSERT INTO branch_schedules (id, branch_id, day_of_week, start_time, end_time, created_at_utc, updated_at_utc)
			VALUES ($1, $2, $3, $4, $5, now(), now())
			RETURNING id, branch_id, day_of_week, start_time::text, end_time::text, created_at_utc, updated_at_utc
		`, uuid.New(), branch.ID, sr.DayOfWeek, sr.StartTime, sr.EndTime).Scan(
			&sch.ID, &sch.BranchID, &sch.DayOfWeek, &sch.StartTime, &sch.EndTime, &sch.CreatedAtUtc, &sch.UpdatedAtUtc,
		)
		if err != nil {
			return nil, fmt.Errorf("insert schedule: %w", err)
		}
		branch.Schedules = append(branch.Schedules, sch)
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}
	return branch, nil
}

func (s *Service) List(ctx context.Context) ([]Branch, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, code, store_name, tax_id, address, contact_phone, secondary_contact_phone, created_at_utc, updated_at_utc
		FROM branches ORDER BY store_name
	`)
	if err != nil {
		return nil, fmt.Errorf("list branches: %w", err)
	}
	defer rows.Close()

	branches := make([]Branch, 0)
	branchIDs := make([]uuid.UUID, 0)
	for rows.Next() {
		var b Branch
		if err := rows.Scan(&b.ID, &b.Code, &b.StoreName, &b.TaxID, &b.Address, &b.ContactPhone,
			&b.SecondaryContactPhone, &b.CreatedAtUtc, &b.UpdatedAtUtc); err != nil {
			return nil, fmt.Errorf("scan branch: %w", err)
		}
		b.Schedules = make([]Schedule, 0)
		branches = append(branches, b)
		branchIDs = append(branchIDs, b.ID)
	}

	if len(branchIDs) == 0 {
		return branches, nil
	}

	schedRows, err := s.pool.Query(ctx, `
		SELECT id, branch_id, day_of_week, start_time::text, end_time::text, created_at_utc, updated_at_utc
		FROM branch_schedules
		WHERE branch_id = ANY($1)
		ORDER BY branch_id, day_of_week, start_time
	`, branchIDs)
	if err != nil {
		return nil, fmt.Errorf("list schedules: %w", err)
	}
	defer schedRows.Close()

	schedMap := make(map[uuid.UUID][]Schedule)
	for schedRows.Next() {
		var sch Schedule
		if err := schedRows.Scan(&sch.ID, &sch.BranchID, &sch.DayOfWeek, &sch.StartTime, &sch.EndTime, &sch.CreatedAtUtc, &sch.UpdatedAtUtc); err != nil {
			return nil, fmt.Errorf("scan schedule: %w", err)
		}
		schedMap[sch.BranchID] = append(schedMap[sch.BranchID], sch)
	}

	for i := range branches {
		if s, ok := schedMap[branches[i].ID]; ok {
			branches[i].Schedules = s
		}
	}

	return branches, nil
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*Branch, error) {
	branch := &Branch{}
	err := s.pool.QueryRow(ctx, `
		SELECT id, code, store_name, tax_id, address, contact_phone, secondary_contact_phone, created_at_utc, updated_at_utc
		FROM branches WHERE id = $1
	`, id).Scan(
		&branch.ID, &branch.Code, &branch.StoreName, &branch.TaxID, &branch.Address, &branch.ContactPhone,
		&branch.SecondaryContactPhone, &branch.CreatedAtUtc, &branch.UpdatedAtUtc,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get branch: %w", err)
	}

	branch.Schedules = make([]Schedule, 0)
	schedRows, err := s.pool.Query(ctx, `
		SELECT id, branch_id, day_of_week, start_time::text, end_time::text, created_at_utc, updated_at_utc
		FROM branch_schedules
		WHERE branch_id = $1
		ORDER BY day_of_week, start_time
	`, id)
	if err != nil {
		return nil, fmt.Errorf("list schedules: %w", err)
	}
	defer schedRows.Close()

	for schedRows.Next() {
		var sch Schedule
		if err := schedRows.Scan(&sch.ID, &sch.BranchID, &sch.DayOfWeek, &sch.StartTime, &sch.EndTime, &sch.CreatedAtUtc, &sch.UpdatedAtUtc); err != nil {
			return nil, fmt.Errorf("scan schedule: %w", err)
		}
		branch.Schedules = append(branch.Schedules, sch)
	}

	return branch, nil
}
