package rbac

import (
	"time"

	"github.com/google/uuid"
)

type ResourceResponse struct {
	ID   uuid.UUID `json:"id"`
	Code string    `json:"code"`
}

type CreateResourceRequest struct {
	Code string `json:"code"`
}

type UpdateResourceRequest struct {
	Code string `json:"code"`
}

type RoleResponse struct {
	ID          uuid.UUID       `json:"id"`
	Code        string          `json:"code"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Resources   []ResourceEntry `json:"resources"`
}

type CreateRoleRequest struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type UpdateRoleRequest struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type AssignResourceRequest struct {
	ResourceID uuid.UUID `json:"resource_id"`
}

type ProfileResponse struct {
	ID        uuid.UUID   `json:"id"`
	Name      string      `json:"name"`
	Code      string      `json:"code"`
	Roles     []RoleEntry `json:"roles"`
	UserCount int         `json:"user_count"`
	CreatedAt time.Time   `json:"created_at_utc"`
	UpdatedAt time.Time   `json:"updated_at_utc"`
}

type CreateProfileRequest struct {
	Name string `json:"name" validate:"required"`
	Code string `json:"code" validate:"required"`
}

type UpdateProfileRequest struct {
	Name string `json:"name"`
	Code string `json:"code"`
}

type AssignRoleRequest struct {
	RoleID uuid.UUID `json:"role_id"`
}

type AssignProfileRequest struct {
	ProfileID uuid.UUID `json:"profile_id"`
}

type RoleEntry struct {
	ID   uuid.UUID `json:"id"`
	Code string    `json:"code"`
	Name string    `json:"name"`
}

type ResourceEntry struct {
	ID   uuid.UUID `json:"id"`
	Code string    `json:"code"`
}
