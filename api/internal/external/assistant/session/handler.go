package session

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lcdpc/lcdpc-go/internal/http/middleware"
	"github.com/lcdpc/lcdpc-go/internal/http/response"
	"github.com/lcdpc/lcdpc-go/internal/rbac"
)

type Handler struct {
	svc      *Service
	rbacStore *rbac.Store
}

func NewHandler(svc *Service, rbacStore *rbac.Store) *Handler {
	return &Handler{svc: svc, rbacStore: rbacStore}
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	var branchID *uuid.UUID
	if !middleware.HasPermission(r.Context(), h.rbacStore, "view:branch:all") {
		if bidStr := middleware.GetBranchID(r.Context()); bidStr != "" {
			if id, err := uuid.Parse(bidStr); err == nil {
				branchID = &id
			}
		}
	}

	result, err := h.svc.List(r.Context(), branchID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	if req.Username == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"username": "required"})
		return
	}
	if req.Password == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"password": "required"})
		return
	}
	if req.BranchID == uuid.Nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"branch_id": "required"})
		return
	}
	result, err := h.svc.Create(r.Context(), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.Created(w, result)
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}
	var req UpdateRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	result, err := h.svc.Update(r.Context(), id, req)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
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
	if err := h.svc.Delete(r.Context(), id); err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, map[string]string{"status": "deleted"})
}
