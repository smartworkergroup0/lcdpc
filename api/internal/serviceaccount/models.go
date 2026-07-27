package serviceaccount

import (
	"time"

	"github.com/google/uuid"
)

type ServiceAccountResponse struct {
	ID               uuid.UUID `json:"id"`
	Name             string    `json:"name"`
	Username         string    `json:"username"`
	ProfileID        uuid.UUID `json:"profile_id"`
	ProfileName      string    `json:"profile_name"`
	BranchID         uuid.UUID `json:"branch_id"`
	BranchName       string    `json:"branch_name"`
	TokenExpiryHours int       `json:"token_expiry_hours"`
	IsActive         bool      `json:"is_active"`
	CreatedAtUTC     time.Time `json:"created_at_utc"`
	UpdatedAtUTC     time.Time `json:"updated_at_utc"`
}

type CreateRequest struct {
	Name             string    `json:"name"`
	Username         string    `json:"username"`
	Password         string    `json:"password"`
	ProfileID        uuid.UUID `json:"profile_id"`
	BranchID         uuid.UUID `json:"branch_id"`
	TokenExpiryHours *int      `json:"token_expiry_hours"`
}

type UpdateRequest struct {
	Name             string    `json:"name"`
	IsActive         *bool     `json:"is_active"`
	ProfileID        uuid.UUID `json:"profile_id"`
	BranchID         uuid.UUID `json:"branch_id"`
	TokenExpiryHours *int      `json:"token_expiry_hours"`
}

type CreateResult struct {
	ServiceAccountResponse
	RawPassword string `json:"raw_password"`
}
