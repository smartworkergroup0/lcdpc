package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/lcdpc/lcdpc-go/internal/branch"
	"github.com/lcdpc/lcdpc-go/internal/http/middleware"
	"github.com/lcdpc/lcdpc-go/internal/rbac"
)

type SABranchHandler struct {
	branchSvc *branch.Service
	rbacStore *rbac.Store
}

func NewSABranchHandler(branchSvc *branch.Service, rbacStore *rbac.Store) *SABranchHandler {
	return &SABranchHandler{branchSvc: branchSvc, rbacStore: rbacStore}
}

func (h *SABranchHandler) List(w http.ResponseWriter, r *http.Request) {
	if !middleware.HasPermission(r.Context(), h.rbacStore, "branch:view") {
		http.Error(w, `{"message":"insufficient_permissions"}`, http.StatusForbidden)
		return
	}

	result, err := h.branchSvc.List(r.Context())
	if err != nil {
		slog.Error("list branches failed", "error", err)
		http.Error(w, `{"message":"internal error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
