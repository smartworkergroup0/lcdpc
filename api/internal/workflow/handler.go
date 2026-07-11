package workflow

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lcdpc/lcdpc-go/internal/http/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) ListOrderStatuses(w http.ResponseWriter, r *http.Request) {
	statuses, err := h.svc.ListOrderStatuses(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, statuses)
}

func (h *Handler) ListOrderTransitions(w http.ResponseWriter, r *http.Request) {
	transitions, err := h.svc.ListOrderTransitions(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, transitions)
}

func (h *Handler) ListWorkflows(w http.ResponseWriter, r *http.Request) {
	filter := WorkflowFilter{}

	if entityType := r.URL.Query().Get("entity_type"); entityType != "" {
		filter.EntityType = &entityType
	}
	if isActiveStr := r.URL.Query().Get("is_active"); isActiveStr != "" {
		if isActive, err := strconv.ParseBool(isActiveStr); err == nil {
			filter.IsActive = &isActive
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

	items, total, err := h.svc.ListWorkflows(r.Context(), filter)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Paginated(w, items, total, filter.GetLimit(), filter.GetOffset())
}

func (h *Handler) GetWorkflowByID(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}

	result, err := h.svc.GetWorkflowByID(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *Handler) CreateWorkflow(w http.ResponseWriter, r *http.Request) {
	var req CreateWorkflowRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	result, err := h.svc.CreateWorkflow(r.Context(), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Created(w, result)
}

func (h *Handler) UpdateWorkflow(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}

	var req UpdateWorkflowRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	result, err := h.svc.UpdateWorkflow(r.Context(), id, req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *Handler) DeleteWorkflow(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}

	if err := h.svc.DeleteWorkflow(r.Context(), id); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, nil)
}
