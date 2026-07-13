package order

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lcdpc/lcdpc-go/internal/http/middleware"
	"github.com/lcdpc/lcdpc-go/internal/http/response"
	"github.com/lcdpc/lcdpc-go/internal/rbac"
)

type Handler struct {
	svc       *Service
	rbacStore *rbac.Store
}

func NewHandler(svc *Service, rbacStore *rbac.Store) *Handler {
	return &Handler{svc: svc, rbacStore: rbacStore}
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateOrderRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	var changedBy *uuid.UUID
	if changedByStr := middleware.GetUserID(r.Context()); changedByStr != "" {
		parsed, err := uuid.Parse(changedByStr)
		if err != nil {
			response.Error(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		changedBy = &parsed
	}

	result, err := h.svc.Create(r.Context(), req, changedBy)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Created(w, result)
}

func (h *Handler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}

	result, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	filter := OrderFilter{}

	if branchIDStr := r.URL.Query().Get("branch_id"); branchIDStr != "" {
		if branchID, err := uuid.Parse(branchIDStr); err == nil {
			filter.BranchID = &branchID
		}
	}
	if personStr := r.URL.Query().Get("person_id"); personStr != "" {
		if personID, err := uuid.Parse(personStr); err == nil {
			filter.PersonID = &personID
		}
	}
	if clientStr := r.URL.Query().Get("client_user_id"); clientStr != "" {
		if clientID, err := uuid.Parse(clientStr); err == nil {
			filter.ClientUserID = &clientID
		}
	}
	if status := r.URL.Query().Get("status"); status != "" {
		filter.Status = &status
	}
	if displayID := r.URL.Query().Get("display_id"); displayID != "" {
		filter.DisplayID = &displayID
	}
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil {
			filter.Limit = limit
		}
	}
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if offset, err := strconv.Atoi(offsetStr); err == nil {
			filter.Offset = offset
		}
	}

	// Auto-filter by assigned branch if user lacks view:branch:all
	if !middleware.HasPermission(r.Context(), h.rbacStore, "view:branch:all") {
		branchIDStr := middleware.GetBranchID(r.Context())
		if branchIDStr != "" {
			if id, err := uuid.Parse(branchIDStr); err == nil {
				filter.BranchID = &id
			}
		}
	}

	items, total, err := h.svc.List(r.Context(), filter)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Paginated(w, items, total, filter.GetLimit(), filter.GetOffset())
}

func (h *Handler) ListMatrix(w http.ResponseWriter, r *http.Request) {
	filter := MatrixFilter{}

	if branchIDStr := r.URL.Query().Get("branch_id"); branchIDStr != "" {
		if branchID, err := uuid.Parse(branchIDStr); err == nil {
			filter.BranchID = &branchID
		}
	}
	if dateFromStr := r.URL.Query().Get("date_from"); dateFromStr != "" {
		if t, err := time.Parse("2006-01-02", dateFromStr); err == nil {
			filter.DateFrom = &t
		} else if t, err := time.Parse(time.RFC3339, dateFromStr); err == nil {
			filter.DateFrom = &t
		}
	}
	if dateToStr := r.URL.Query().Get("date_to"); dateToStr != "" {
		if t, err := time.Parse("2006-01-02", dateToStr); err == nil {
			filter.DateTo = &t
		} else if t, err := time.Parse(time.RFC3339, dateToStr); err == nil {
			filter.DateTo = &t
		}
	}
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil {
			filter.Limit = limit
		}
	}
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if offset, err := strconv.Atoi(offsetStr); err == nil {
			filter.Offset = offset
		}
	}

	// Auto-filter by assigned branch if user lacks view:branch:all
	if !middleware.HasPermission(r.Context(), h.rbacStore, "view:branch:all") {
		branchIDStr := middleware.GetBranchID(r.Context())
		if branchIDStr != "" {
			if id, err := uuid.Parse(branchIDStr); err == nil {
				filter.BranchID = &id
			}
		}
	}

	items, total, err := h.svc.ListWithHistory(r.Context(), filter)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Paginated(w, items, total, filter.GetLimit(), filter.GetOffset())
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}

	var req UpdateOrderRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	result, err := h.svc.Update(r.Context(), id, req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}

	changedByStr := middleware.GetUserID(r.Context())
	changedBy, err := uuid.Parse(changedByStr)
	if err != nil {
		response.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if err := h.svc.Delete(r.Context(), id, changedBy); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, nil)
}

func (h *Handler) ChangeStatus(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}

	var req StatusChangeRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	changedByStr := middleware.GetUserID(r.Context())
	changedBy, err := uuid.Parse(changedByStr)
	if err != nil {
		response.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	result, err := h.svc.ChangeStatus(r.Context(), id, req, changedBy)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *Handler) GetValidTransitions(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}

	result, err := h.svc.GetValidTransitions(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *Handler) GetHistory(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}

	result, err := h.svc.GetHistory(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, result)
}
