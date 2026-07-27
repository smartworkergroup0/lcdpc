package assistant

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lcdpc/lcdpc-go/internal/http/response"
)

type Handler struct {
	client *Client
}

func NewHandler(client *Client) *Handler {
	return &Handler{client: client}
}

func extractAccountID(r *http.Request) (uuid.UUID, error) {
	idStr := r.Header.Get("X-Assistant-Account-ID")
	if idStr == "" {
		return uuid.Nil, fmt.Errorf("X-Assistant-Account-ID header is required")
	}
	return uuid.Parse(idStr)
}

func (h *Handler) ListLeads(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	accountID, err := extractAccountID(r)
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"X-Assistant-Account-ID": err.Error()})
		return
	}

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

	items, total, err := h.client.ListLeads(ctx, accountID, f)
	if err != nil {
		response.Error(w, http.StatusBadGateway, "Failed to fetch leads from assistant API")
		return
	}

	response.Paginated(w, items, total, f.Limit, f.Offset)
}

func (h *Handler) ListOrders(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	accountID, err := extractAccountID(r)
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"X-Assistant-Account-ID": err.Error()})
		return
	}

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

	items, total, err := h.client.ListOrders(ctx, accountID, f)
	if err != nil {
		response.Error(w, http.StatusBadGateway, "Failed to fetch orders from assistant API")
		return
	}

	response.Paginated(w, items, total, f.Limit, f.Offset)
}

func (h *Handler) AcceptOrder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	accountID, err := extractAccountID(r)
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"X-Assistant-Account-ID": err.Error()})
		return
	}

	orderID := chi.URLParam(r, "orderID")
	if orderID == "" {
		response.Error(w, http.StatusBadRequest, "orderID is required")
		return
	}

	if err := h.client.ChangeOrderStatus(ctx, accountID, orderID, "PROCESADO"); err != nil {
		response.Error(w, http.StatusBadGateway, "Failed to change order status to PROCESADO")
		return
	}

	_ = h.client.MarkOrderProcessed(ctx, accountID, orderID)

	response.Success(w, map[string]string{"status": "accepted"})
}

func (h *Handler) MarkProcessedOrder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	accountID, err := extractAccountID(r)
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"X-Assistant-Account-ID": err.Error()})
		return
	}

	orderID := chi.URLParam(r, "orderID")
	if orderID == "" {
		response.Error(w, http.StatusBadRequest, "orderID is required")
		return
	}

	if err := h.client.MarkOrderProcessed(ctx, accountID, orderID); err != nil {
		response.Error(w, http.StatusBadGateway, "Failed to mark order as processed")
		return
	}

	response.Success(w, map[string]string{"status": "processed"})
}

func (h *Handler) RejectOrder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	accountID, err := extractAccountID(r)
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"X-Assistant-Account-ID": err.Error()})
		return
	}

	orderID := chi.URLParam(r, "orderID")
	if orderID == "" {
		response.Error(w, http.StatusBadRequest, "orderID is required")
		return
	}

	if err := h.client.ChangeOrderStatus(ctx, accountID, orderID, "CANCELADO"); err != nil {
		response.Error(w, http.StatusBadGateway, "Failed to change order status to CANCELADO")
		return
	}

	_ = h.client.MarkOrderProcessed(ctx, accountID, orderID)

	response.Success(w, map[string]string{"status": "rejected"})
}
