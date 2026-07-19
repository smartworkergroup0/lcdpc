package assistant

type Lead struct {
	ID                 string `json:"id"`
	FirstName          string `json:"first_name"`
	LastName           string `json:"last_name"`
	Phone              string `json:"phone"`
	Email              string `json:"email"`
	Status             string `json:"status"`
	Score              int    `json:"score"`
	UserIdentification string `json:"user_identification"`
	Address            string `json:"address"`
	IsProcessed        bool   `json:"is_processed"`
	CreatedAt          string `json:"created_at"`
}

type Order struct {
	ID              string `json:"id"`
	CustomerName    string `json:"customer_name"`
	Identification  string `json:"identification"`
	Address         string `json:"address"`
	Summary         string `json:"summary"`
	Status          string `json:"status"`
	ReferenceNumber string `json:"reference_number"`
	IsProcessed     bool   `json:"is_processed"`
	CreatedAt       string `json:"created_at"`
}

type ListFilter struct {
	Search      *string
	Status      *string
	IsProcessed *bool
	Limit       int
	Offset      int
}

type authResponse struct {
	Access string `json:"access"`
}

type listResponse[T any] struct {
	Count   int `json:"count"`
	Results []T `json:"results"`
}
