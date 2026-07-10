package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/lcdpc/lcdpc-go/internal/http/middleware"
	"github.com/lcdpc/lcdpc-go/internal/pricing"
	"github.com/lcdpc/lcdpc-go/internal/rbac"
)

type SAPricingHandler struct {
	pricingSvc    *pricing.Service
	rbacStore     *rbac.Store
	catalogDomain string
}

func NewSAPricingHandler(pricingSvc *pricing.Service, rbacStore *rbac.Store, catalogDomain string) *SAPricingHandler {
	return &SAPricingHandler{pricingSvc: pricingSvc, rbacStore: rbacStore, catalogDomain: catalogDomain}
}

func (h *SAPricingHandler) ListProducts(w http.ResponseWriter, r *http.Request) {
	if !middleware.HasPermission(r.Context(), h.rbacStore, "product:view") {
		http.Error(w, `{"message":"insufficient_permissions"}`, http.StatusForbidden)
		return
	}

	f := pricing.ParseProductFilter(r)

	result, err := h.pricingSvc.ListCatalogProducts(r.Context(), f, h.catalogDomain)
	if err != nil {
		slog.Error("list catalog products failed", "error", err, "filter", f)
		http.Error(w, `{"message":"internal error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *SAPricingHandler) ListBundles(w http.ResponseWriter, r *http.Request) {
	if !middleware.HasPermission(r.Context(), h.rbacStore, "bundle:view") {
		http.Error(w, `{"message":"insufficient_permissions"}`, http.StatusForbidden)
		return
	}

	f := pricing.ParseBundleFilter(r)

	result, err := h.pricingSvc.ListCatalogBundles(r.Context(), f, h.catalogDomain)
	if err != nil {
		slog.Error("list catalog bundles failed", "error", err, "filter", f)
		http.Error(w, `{"message":"internal error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
