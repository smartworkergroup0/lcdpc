package session

import (
	"time"

	"github.com/google/uuid"
)

type AssistantServiceAccount struct {
	ID           uuid.UUID `json:"id"`
	Username     string    `json:"username"`
	BranchID     uuid.UUID `json:"branch_id"`
	BranchName   string    `json:"branch_name"`
	IsActive     bool      `json:"is_active"`
	CreatedAtUTC time.Time `json:"created_at_utc"`
	UpdatedAtUTC time.Time `json:"updated_at_utc"`
}

type CreateRequest struct {
	Username string    `json:"username"`
	Password string    `json:"password"`
	BranchID uuid.UUID `json:"branch_id"`
}

type UpdateRequest struct {
	Username string    `json:"username"`
	Password *string   `json:"password"`
	BranchID uuid.UUID `json:"branch_id"`
	IsActive *bool     `json:"is_active"`
}
