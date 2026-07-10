package dashboard

import (
	"net/http"
	"strconv"

	"github.com/lcdpc/lcdpc-go/internal/http/middleware"
	"github.com/lcdpc/lcdpc-go/internal/http/response"
	"github.com/lcdpc/lcdpc-go/internal/rbac"
)

type Handler struct {
	svc  *Service
	rbac *rbac.Store
}

func NewHandler(svc *Service, rbacStore *rbac.Store) *Handler {
	return &Handler{svc: svc, rbac: rbacStore}
}

func (h *Handler) branchID(r *http.Request) string {
	branchID := middleware.GetBranchID(r.Context())

	if middleware.HasPermission(r.Context(), h.rbac, "view:branch:all") {
		if q := r.URL.Query().Get("branch_id"); q != "" {
			return q
		}
		return ""
	}

	if branchID != "" {
		return branchID
	}
	return ""
}

func (h *Handler) Summary(w http.ResponseWriter, r *http.Request) {
	branchID := h.branchID(r)
	data, err := h.svc.Summary(r.Context(), branchID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, data)
}

func (h *Handler) OrdersByStatus(w http.ResponseWriter, r *http.Request) {
	branchID := h.branchID(r)
	items, err := h.svc.OrdersByStatus(r.Context(), branchID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, items)
}

func (h *Handler) SalesTrend(w http.ResponseWriter, r *http.Request) {
	days := 30
	if v := r.URL.Query().Get("days"); v != "" {
		if d, err := strconv.Atoi(v); err == nil && d > 0 {
			days = d
		}
	}
	branchID := h.branchID(r)
	items, err := h.svc.SalesTrend(r.Context(), days, branchID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, items)
}

func (h *Handler) TopProducts(w http.ResponseWriter, r *http.Request) {
	days := 30
	limit := 10
	if v := r.URL.Query().Get("days"); v != "" {
		if d, err := strconv.Atoi(v); err == nil && d > 0 {
			days = d
		}
	}
	if v := r.URL.Query().Get("limit"); v != "" {
		if l, err := strconv.Atoi(v); err == nil && l > 0 {
			limit = l
		}
	}
	branchID := h.branchID(r)
	items, err := h.svc.TopProducts(r.Context(), days, limit, branchID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, items)
}

func (h *Handler) TopBundles(w http.ResponseWriter, r *http.Request) {
	days := 30
	limit := 10
	if v := r.URL.Query().Get("days"); v != "" {
		if d, err := strconv.Atoi(v); err == nil && d > 0 {
			days = d
		}
	}
	if v := r.URL.Query().Get("limit"); v != "" {
		if l, err := strconv.Atoi(v); err == nil && l > 0 {
			limit = l
		}
	}
	branchID := h.branchID(r)
	items, err := h.svc.TopBundles(r.Context(), days, limit, branchID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, items)
}

func (h *Handler) StockHealth(w http.ResponseWriter, r *http.Request) {
	branchID := h.branchID(r)
	health, err := h.svc.StockHealth(r.Context(), branchID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, health)
}
