package assistant

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/lcdpc/lcdpc-go/internal/http/response"
)

type Handler struct {
	client *Client
}

func NewHandler(client *Client) *Handler {
	return &Handler{client: client}
}

func (h *Handler) ListLeads(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	f := ListFilter{}

	if s := r.URL.Query().Get("search"); s != "" {
		f.Search = &s
	}
	if s := r.URL.Query().Get("status"); s != "" {
		f.Status = &s
	}
	if s := r.URL.Query().Get("is_processed"); s != "" {
		b, err := strconv.ParseBool(s)
		if err == nil {
			f.IsProcessed = &b
		}
	}
	if s := r.URL.Query().Get("user_identification"); s != "" {
		f.UserIdentification = &s
	}
	if s := r.URL.Query().Get("limit"); s != "" {
		if v, err := strconv.Atoi(s); err == nil && v > 0 && v <= 100 {
			f.Limit = v
		}
	}
	if f.Limit == 0 {
		f.Limit = 10
	}
	if s := r.URL.Query().Get("offset"); s != "" {
		if v, err := strconv.Atoi(s); err == nil && v >= 0 {
			f.Offset = v
		}
	}

	items, total, err := h.client.ListLeads(ctx, f)
	if err != nil {
		response.Error(w, http.StatusBadGateway, "Failed to fetch leads from assistant API")
		return
	}

	response.Paginated(w, items, total, f.Limit, f.Offset)
}

func (h *Handler) ListOrders(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	f := ListFilter{}

	if s := r.URL.Query().Get("search"); s != "" {
		f.Search = &s
	}
	if s := r.URL.Query().Get("status"); s != "" {
		f.Status = &s
	}
	if s := r.URL.Query().Get("is_processed"); s != "" {
		b, err := strconv.ParseBool(s)
		if err == nil {
			f.IsProcessed = &b
		}
	} else {
		isProcessed := false
		f.IsProcessed = &isProcessed
	}
	if s := r.URL.Query().Get("limit"); s != "" {
		if v, err := strconv.Atoi(s); err == nil && v > 0 && v <= 100 {
			f.Limit = v
		}
	}
	if f.Limit == 0 {
		f.Limit = 10
	}
	if s := r.URL.Query().Get("offset"); s != "" {
		if v, err := strconv.Atoi(s); err == nil && v >= 0 {
			f.Offset = v
		}
	}

	items, total, err := h.client.ListOrders(ctx, f)
	if err != nil {
		response.Error(w, http.StatusBadGateway, "Failed to fetch orders from assistant API")
		return
	}

	response.Paginated(w, items, total, f.Limit, f.Offset)
}

func (h *Handler) AcceptOrder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	orderID := chi.URLParam(r, "orderID")
	if orderID == "" {
		response.Error(w, http.StatusBadRequest, "orderID is required")
		return
	}

	// Step 1: Change status to PROCESADO — if fails, rollback (return error)
	if err := h.client.ChangeOrderStatus(ctx, orderID, "PROCESADO"); err != nil {
		response.Error(w, http.StatusBadGateway, "Failed to change order status to PROCESADO")
		return
	}

	// Step 2: Mark as processed — if fails, continue anyway
	_ = h.client.MarkOrderProcessed(ctx, orderID)

	response.Success(w, map[string]string{"status": "accepted"})
}

func (h *Handler) RejectOrder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	orderID := chi.URLParam(r, "orderID")
	if orderID == "" {
		response.Error(w, http.StatusBadRequest, "orderID is required")
		return
	}

	// Step 1: Change status to CANCELADO — imperative, if fails return error
	if err := h.client.ChangeOrderStatus(ctx, orderID, "CANCELADO"); err != nil {
		response.Error(w, http.StatusBadGateway, "Failed to change order status to CANCELADO")
		return
	}

	// Step 2: Mark as processed — if fails, continue anyway
	_ = h.client.MarkOrderProcessed(ctx, orderID)

	response.Success(w, map[string]string{"status": "rejected"})
}
