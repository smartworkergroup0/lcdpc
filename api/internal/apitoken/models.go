package apitoken

import (
	"time"

	"github.com/google/uuid"
)

type ApiTokenResponse struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at_utc"`
}

type CreateApiTokenRequest struct {
	Name string `json:"name"`
}

type UpdateApiTokenRequest struct {
	Name     string `json:"name"`
	IsActive *bool  `json:"is_active"`
}

type CreateApiTokenResult struct {
	ApiTokenResponse
	RawToken string `json:"raw_token"`
}
