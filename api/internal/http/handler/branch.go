package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/lcdpc/lcdpc-go/internal/branch"
	"github.com/lcdpc/lcdpc-go/internal/http/middleware"
	"github.com/lcdpc/lcdpc-go/internal/http/response"
	"github.com/lcdpc/lcdpc-go/internal/rbac"
)

type BranchHandler struct {
	svc       *branch.Service
	rbacStore *rbac.Store
}

func NewBranchHandler(svc *branch.Service, rbacStore *rbac.Store) *BranchHandler {
	return &BranchHandler{svc: svc, rbacStore: rbacStore}
}

func (h *BranchHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req branch.CreateBranchRequest
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

func (h *BranchHandler) List(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.List(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *BranchHandler) ListAdmin(w http.ResponseWriter, r *http.Request) {
	canViewAll := middleware.HasPermission(r.Context(), h.rbacStore, "view:branch:all")
	if canViewAll {
		result, err := h.svc.List(r.Context())
		if err != nil {
			response.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		response.Success(w, result)
		return
	}

	branchIDStr := middleware.GetBranchID(r.Context())
	if branchIDStr == "" {
		response.Success(w, []branch.Branch{})
		return
	}

	branchID, err := uuid.Parse(branchIDStr)
	if err != nil {
		response.Success(w, []branch.Branch{})
		return
	}

	result, err := h.svc.GetByID(r.Context(), branchID)
	if err != nil {
		response.Success(w, []branch.Branch{})
		return
	}

	response.Success(w, []branch.Branch{*result})
}
