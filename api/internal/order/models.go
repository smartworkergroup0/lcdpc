package order

import (
	"time"

	"github.com/google/uuid"
)

type Order struct {
	ID              uuid.UUID   `json:"id"`
	DisplayID       string      `json:"display_id"`
	BranchID        uuid.UUID   `json:"branch_id"`
	PersonID        *uuid.UUID  `json:"person_id"`
	ClientUserID    *uuid.UUID  `json:"client_user_id"`
	clientUserIDRaw string      `json:"-"`
	personIDRaw     string      `json:"-"`
	Status          string      `json:"status"`
	PriceTotal      float64     `json:"price_total"`
	TotalItems      int         `json:"total_items"`
	Currency        string      `json:"currency"`
	Notes           *string     `json:"notes"`
	DeletedAt       *time.Time  `json:"deleted_at"`
	CreatedAtUtc    time.Time   `json:"created_at_utc"`
	UpdatedAtUtc    time.Time   `json:"updated_at_utc"`
	Items           []OrderItem `json:"items,omitempty"`
}

type OrderItem struct {
	ID        uuid.UUID  `json:"id"`
	OrderID   uuid.UUID  `json:"order_id"`
	ItemType  string     `json:"item_type"`
	ProductID *uuid.UUID `json:"product_id"`
	BundleID  *uuid.UUID `json:"bundle_id"`
	Quantity  float64    `json:"quantity"`
	UnitPrice float64    `json:"unit_price"`
	Subtotal  float64    `json:"subtotal"`
	Currency  string     `json:"currency"`
}

type CreateOrderRequest struct {
	BranchID               uuid.UUID         `json:"branch_id"`
	PersonID               *string           `json:"person_id,omitempty"`
	ClientUserID           *string           `json:"client_user_id,omitempty"`
	PersonName             *string           `json:"person_name,omitempty"`
	PersonIdentityDocument *string           `json:"person_identity_document,omitempty"`
	PersonTaxID            *string           `json:"person_tax_id,omitempty"`
	PersonWhatsAppPhone    *string           `json:"person_whatsapp_phone,omitempty"`
	PersonFullAddress      *string           `json:"person_full_address,omitempty"`
	Notes                  string            `json:"notes"`
	Items                  []CreateOrderItem `json:"items"`
}

type CreateOrderItem struct {
	ItemType  string    `json:"item_type"`
	ProductID uuid.UUID `json:"product_id"`
	BundleID  uuid.UUID `json:"bundle_id"`
	Quantity  float64   `json:"quantity"`
	UnitPrice float64   `json:"unit_price"`
}

type UpdateOrderRequest struct {
	Notes string            `json:"notes"`
	Items []CreateOrderItem `json:"items"`
}

type StatusChangeRequest struct {
	ToStatus string `json:"to_status"`
	Notes    string `json:"notes"`
}

type StatusHistoryEntry struct {
	ID              uuid.UUID  `json:"id"`
	OrderID         uuid.UUID  `json:"order_id"`
	FromStatus      *string    `json:"from_status"`
	ToStatus        string     `json:"to_status"`
	ChangedByUserID *uuid.UUID `json:"changed_by_user_id"`
	Notes           *string    `json:"notes"`
	CreatedAtUtc    time.Time  `json:"created_at_utc"`
}

const DefaultLimit = 10
const MaxLimit = 100

type OrderFilter struct {
	BranchID     *uuid.UUID
	PersonID     *uuid.UUID
	ClientUserID *uuid.UUID
	Status       *string
	DisplayID    *string
	Limit        int
	Offset       int
}

func (f OrderFilter) GetLimit() int {
	if f.Limit <= 0 {
		return DefaultLimit
	}
	if f.Limit > MaxLimit {
		return MaxLimit
	}
	return f.Limit
}

func (f OrderFilter) GetOffset() int {
	if f.Offset < 0 {
		return 0
	}
	return f.Offset
}
