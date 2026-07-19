package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lcdpc/lcdpc-go/internal/http/middleware"
	"github.com/lcdpc/lcdpc-go/internal/http/response"
	"github.com/lcdpc/lcdpc-go/internal/rbac"
	"github.com/lcdpc/lcdpc-go/internal/staff"
)

type StaffHandler struct {
	svc       *staff.Service
	rbacStore *rbac.Store
}

func NewStaffHandler(svc *staff.Service, rbacStore *rbac.Store) *StaffHandler {
	return &StaffHandler{svc: svc, rbacStore: rbacStore}
}

func (h *StaffHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := staff.StaffFilter{}

	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			f.Limit = n
		}
	}
	if v := q.Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			f.Offset = n
		}
	}
	if v := q.Get("branch_id"); v != "" {
		if id, err := uuid.Parse(v); err == nil {
			f.BranchID = &id
		}
	}
	if v := q.Get("search"); v != "" {
		f.Search = &v
	}

	// Auto-filter by assigned branch if user lacks view:branch:all
	if !middleware.HasPermission(r.Context(), h.rbacStore, "view:branch:all") {
		branchIDStr := middleware.GetBranchID(r.Context())
		if branchIDStr != "" {
			if id, err := uuid.Parse(branchIDStr); err == nil {
				f.BranchID = &id
			}
		}
	}

	items, total, err := h.svc.List(r.Context(), f)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Paginated(w, items, total, f.GetLimit(), f.GetOffset())
}

func (h *StaffHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	result, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *StaffHandler) LookupByDocument(w http.ResponseWriter, r *http.Request) {
	doc := chi.URLParam(r, "doc")
	if doc == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"doc": "required"})
		return
	}

	result, err := h.svc.LookupByDocument(r.Context(), doc)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *StaffHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req staff.CreateStaffRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	result, err := h.svc.Create(r.Context(), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Created(w, result)
}

func (h *StaffHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	var req staff.UpdateStaffRequest
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

func (h *StaffHandler) ToggleStatus(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	result, err := h.svc.ToggleStatus(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *StaffHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		if strings.Contains(err.Error(), "LAST_SUPERADMIN_FORBIDDEN") {
			response.Error(w, http.StatusForbidden, err.Error())
			return
		}
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, map[string]string{"status": "deleted"})
}

func (h *StaffHandler) ListProfiles(w http.ResponseWriter, r *http.Request) {
	profiles, err := h.svc.ListProfiles(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, profiles)
}
