package handler

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/lcdpc/lcdpc-go/internal/http/response"
	"github.com/lcdpc/lcdpc-go/internal/sync"
)

type SyncHandler struct {
	svc *sync.Service
}

func NewSyncHandler(svc *sync.Service) *SyncHandler {
	return &SyncHandler{svc: svc}
}

func (h *SyncHandler) SyncProducts(w http.ResponseWriter, r *http.Request) {
	var req []sync.SyncProductRequest
	if err := response.Decode(r, &req); err != nil {
		slog.Warn("sync products: decode failed", "error", err)
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid json"})
		return
	}

	if len(req) == 0 {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "empty request"})
		return
	}

	result, err := h.svc.SyncProducts(r.Context(), req)
	if err != nil {
		slog.Error("sync products: failed", "error", err)
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": err.Error()})
		return
	}

	if result.Errors > 0 {
		for _, d := range result.Details {
			slog.Warn("sync products: item error", "identifier", d.Identifier, "message", d.Message)
		}
	}

	response.Success(w, result)
}

func (h *SyncHandler) SyncBundles(w http.ResponseWriter, r *http.Request) {
	var req []sync.SyncBundleRequest
	if err := response.Decode(r, &req); err != nil {
		slog.Warn("sync bundles: decode failed", "error", err)
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid json"})
		return
	}

	if len(req) == 0 {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "empty request"})
		return
	}

	result, err := h.svc.SyncBundles(r.Context(), req)
	if err != nil {
		slog.Error("sync bundles: failed", "error", err)
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": err.Error()})
		return
	}

	if result.Errors > 0 {
		for _, d := range result.Details {
			slog.Warn("sync bundles: item error", "identifier", d.Identifier, "message", d.Message)
		}
	}

	response.Success(w, result)
}

func (h *SyncHandler) SyncProductImage(w http.ResponseWriter, r *http.Request) {
	sku := chi.URLParam(r, "sku")
	if sku == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"sku": "required"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"file": "invalid or too large"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"file": "required"})
		return
	}
	defer file.Close()

	ext, err := validateImageFile(file, header)
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"file": err.Error()})
		return
	}

	newPath, err := saveUploadedFile(file, ext, "products")
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to save image")
		return
	}

	oldImg, err := h.svc.UpdateProductImageBySKU(r.Context(), sku, newPath)
	if err != nil {
		deleteOldFile(newPath)
		response.Error(w, http.StatusNotFound, "product not found")
		return
	}

	if oldImg != "" {
		deleteOldFile(oldImg)
	}

	response.Success(w, map[string]string{"img": newPath})
}

func (h *SyncHandler) SyncBundleImage(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	if code == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"code": "required"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"file": "invalid or too large"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"file": "required"})
		return
	}
	defer file.Close()

	ext, err := validateImageFile(file, header)
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"file": err.Error()})
		return
	}

	newPath, err := saveUploadedFile(file, ext, "bundles")
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to save image")
		return
	}

	oldImg, err := h.svc.UpdateBundleImageByCode(r.Context(), code, newPath)
	if err != nil {
		deleteOldFile(newPath)
		response.Error(w, http.StatusNotFound, "bundle not found")
		return
	}

	if oldImg != "" {
		deleteOldFile(oldImg)
	}

	response.Success(w, map[string]string{"img": newPath})
}
