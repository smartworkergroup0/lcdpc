package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lcdpc/lcdpc-go/internal/http/middleware"
	"github.com/lcdpc/lcdpc-go/internal/http/response"
	"github.com/lcdpc/lcdpc-go/internal/pricing"
	"github.com/lcdpc/lcdpc-go/internal/rbac"
	"github.com/nfnt/resize"
	"golang.org/x/image/webp"
)

const (
	maxUploadSize = 5 << 20 // 5MB
	staticImgDir  = "static/img"
)

var allowedMimeTypes = map[string]string{
	"image/jpeg":               ".jpg",
	"image/png":                ".png",
	"image/webp":               ".webp",
	"image/gif":                ".gif",
	"image/x-icon":             ".ico",
	"image/vnd.microsoft.icon": ".ico",
}

// Product Handler

type ProductHandler struct {
	svc       *pricing.Service
	rbacStore *rbac.Store
}

func NewProductHandler(svc *pricing.Service, rbacStore *rbac.Store) *ProductHandler {
	return &ProductHandler{svc: svc, rbacStore: rbacStore}
}

func (h *ProductHandler) Create(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid or too large"})
		return
	}

	dataStr := r.FormValue("data")
	if dataStr == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"data": "required"})
		return
	}

	var req pricing.CreateProductRequest
	if err := json.Unmarshal([]byte(dataStr), &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"data": "invalid json"})
		return
	}

	file, header, err := r.FormFile("file")
	if err == nil {
		defer file.Close()
		ext, err := validateImageFile(file, header)
		if err != nil {
			response.Fail(w, http.StatusBadRequest, map[string]string{"file": err.Error()})
			return
		}
		imgPath, err := saveUploadedFile(file, ext, "products")
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "failed to save image")
			return
		}
		req.Img = &imgPath
	}

	result, err := h.svc.CreateProduct(r.Context(), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Created(w, result)
}

func (h *ProductHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	result, err := h.svc.GetProductByID(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *ProductHandler) ListCatalog(w http.ResponseWriter, r *http.Request) {
	f := pricing.ParseProductFilter(r)

	if f.BranchID == nil {
		response.Error(w, http.StatusBadRequest, "branch_id is required")
		return
	}

	isActive := true
	f.IsActive = &isActive

	items, total, err := h.svc.ListProducts(r.Context(), f)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Paginated(w, items, total, f.GetLimit(), f.GetOffset())
}

func (h *ProductHandler) List(w http.ResponseWriter, r *http.Request) {
	f := pricing.ParseProductFilter(r)

	if !middleware.HasPermission(r.Context(), h.rbacStore, "view:branch:all") {
		branchIDStr := middleware.GetBranchID(r.Context())
		if branchIDStr == "" {
			response.Paginated(w, []interface{}{}, 0, f.GetLimit(), f.GetOffset())
			return
		}
		if id, err := uuid.Parse(branchIDStr); err == nil {
			f.BranchID = &id
		}
	}

	items, total, err := h.svc.ListProducts(r.Context(), f)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Paginated(w, items, total, f.GetLimit(), f.GetOffset())
}

func (h *ProductHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid or too large"})
		return
	}

	dataStr := r.FormValue("data")
	if dataStr == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"data": "required"})
		return
	}

	var req pricing.CreateProductRequest
	if err := json.Unmarshal([]byte(dataStr), &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"data": "invalid json"})
		return
	}

	file, header, err := r.FormFile("file")
	if err == nil {
		defer file.Close()
		ext, err := validateImageFile(file, header)
		if err != nil {
			response.Fail(w, http.StatusBadRequest, map[string]string{"file": err.Error()})
			return
		}
		imgPath, err := saveUploadedFile(file, ext, "products")
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "failed to save image")
			return
		}
		req.Img = &imgPath
	}

	result, err := h.svc.UpdateProduct(r.Context(), id, req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *ProductHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	if err := h.svc.DeleteProduct(r.Context(), id); err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, map[string]string{"status": "deleted"})
}

func (h *ProductHandler) ToggleActive(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	result, err := h.svc.ToggleProductActive(r.Context(), id)
	if err != nil {
		if errors.Is(err, pricing.ErrNotFound) {
			response.Error(w, http.StatusNotFound, "product not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *ProductHandler) UpdateImage(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
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

	// Save new file first (with temp name)
	newPath, err := saveUploadedFile(file, ext, "products")
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to save image")
		return
	}

	// Update DB — returns old image path
	oldImg, err := h.svc.UpdateProductImage(r.Context(), id, newPath)
	if err != nil {
		// Rollback: delete the new file
		deleteOldFile(newPath)
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}

	// Delete old file if existed
	if oldImg != "" {
		deleteOldFile(oldImg)
	}

	response.Success(w, map[string]string{"img": newPath})
}

// Bundle Handler

type BundleHandler struct {
	svc       *pricing.Service
	rbacStore *rbac.Store
}

func NewBundleHandler(svc *pricing.Service, rbacStore *rbac.Store) *BundleHandler {
	return &BundleHandler{svc: svc, rbacStore: rbacStore}
}

func (h *BundleHandler) Create(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid or too large"})
		return
	}

	dataStr := r.FormValue("data")
	if dataStr == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"data": "required"})
		return
	}

	var req pricing.CreateBundleRequest
	if err := json.Unmarshal([]byte(dataStr), &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"data": "invalid json"})
		return
	}

	file, header, err := r.FormFile("file")
	if err == nil {
		defer file.Close()
		ext, err := validateImageFile(file, header)
		if err != nil {
			response.Fail(w, http.StatusBadRequest, map[string]string{"file": err.Error()})
			return
		}
		imgPath, err := saveUploadedFile(file, ext, "bundles")
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "failed to save image")
			return
		}
		req.Img = &imgPath
	}

	result, err := h.svc.CreateBundle(r.Context(), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Created(w, result)
}

func (h *BundleHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	result, err := h.svc.GetBundleByID(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *BundleHandler) ListCatalog(w http.ResponseWriter, r *http.Request) {
	f := pricing.ParseBundleFilter(r)

	if f.BranchID == nil {
		response.Error(w, http.StatusBadRequest, "branch_id is required")
		return
	}

	status := "Active"
	f.Status = &status

	items, total, err := h.svc.ListBundles(r.Context(), f)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Paginated(w, items, total, f.GetLimit(), f.GetOffset())
}

func (h *BundleHandler) List(w http.ResponseWriter, r *http.Request) {
	f := pricing.ParseBundleFilter(r)

	if !middleware.HasPermission(r.Context(), h.rbacStore, "view:branch:all") {
		branchIDStr := middleware.GetBranchID(r.Context())
		if branchIDStr == "" {
			response.Paginated(w, []interface{}{}, 0, f.GetLimit(), f.GetOffset())
			return
		}
		if id, err := uuid.Parse(branchIDStr); err == nil {
			f.BranchID = &id
		}
	}

	items, total, err := h.svc.ListBundles(r.Context(), f)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Paginated(w, items, total, f.GetLimit(), f.GetOffset())
}

func (h *BundleHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid or too large"})
		return
	}

	dataStr := r.FormValue("data")
	if dataStr == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"data": "required"})
		return
	}

	var req pricing.CreateBundleRequest
	if err := json.Unmarshal([]byte(dataStr), &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"data": "invalid json"})
		return
	}

	file, header, err := r.FormFile("file")
	if err == nil {
		defer file.Close()
		ext, err := validateImageFile(file, header)
		if err != nil {
			response.Fail(w, http.StatusBadRequest, map[string]string{"file": err.Error()})
			return
		}
		imgPath, err := saveUploadedFile(file, ext, "bundles")
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "failed to save image")
			return
		}
		req.Img = &imgPath
	}

	result, err := h.svc.UpdateBundle(r.Context(), id, req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *BundleHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	if err := h.svc.DeleteBundle(r.Context(), id); err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, map[string]string{"status": "deleted"})
}

func (h *BundleHandler) ToggleActive(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	result, err := h.svc.ToggleBundleActive(r.Context(), id)
	if err != nil {
		if errors.Is(err, pricing.ErrNotFound) {
			response.Error(w, http.StatusNotFound, "bundle not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *BundleHandler) ListPrices(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	result, err := h.svc.ListBundlePrices(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *BundleHandler) CreatePrice(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	var req pricing.CreateBundlePriceRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	req.BundleID = id

	result, err := h.svc.CreateBundlePrice(r.Context(), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Created(w, result)
}

func (h *BundleHandler) UpdatePrice(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	bundleID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	priceIDStr := chiURLParam(r, "priceId")
	priceID, err := uuid.Parse(priceIDStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid price id")
		return
	}

	var req pricing.CreateBundlePriceRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	result, err := h.svc.UpdateBundlePrice(r.Context(), priceID, bundleID, req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *BundleHandler) DeletePrice(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	bundleID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	priceIDStr := chiURLParam(r, "priceId")
	priceID, err := uuid.Parse(priceIDStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid price id")
		return
	}

	if err := h.svc.DeleteBundlePrice(r.Context(), priceID, bundleID); err != nil {
		if errors.Is(err, pricing.ErrNotFound) {
			response.Error(w, http.StatusNotFound, "price not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, map[string]string{"status": "deleted"})
}

func (h *BundleHandler) UpdateImage(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
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

	// Save new file first (with temp name)
	newPath, err := saveUploadedFile(file, ext, "bundles")
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to save image")
		return
	}

	// Update DB — returns old image path
	oldImg, err := h.svc.UpdateBundleImage(r.Context(), id, newPath)
	if err != nil {
		// Rollback: delete the new file
		deleteOldFile(newPath)
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}

	// Delete old file if existed
	if oldImg != "" {
		deleteOldFile(oldImg)
	}

	response.Success(w, map[string]string{"img": newPath})
}

// Price Handler

type PriceHandler struct {
	svc *pricing.Service
}

func NewPriceHandler(svc *pricing.Service) *PriceHandler {
	return &PriceHandler{svc: svc}
}

func (h *PriceHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req pricing.CreatePriceRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	result, err := h.svc.CreatePrice(r.Context(), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Created(w, result)
}

func (h *PriceHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	result, err := h.svc.GetPriceByID(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *PriceHandler) ListByProductID(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	result, err := h.svc.ListPricesByProductID(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *PriceHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	var req pricing.CreatePriceRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	result, err := h.svc.UpdatePrice(r.Context(), id, req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *PriceHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	if err := h.svc.DeletePrice(r.Context(), id); err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, map[string]string{"status": "deleted"})
}

// Price Category Handler

type PriceCategoryHandler struct {
	svc *pricing.Service
}

func NewPriceCategoryHandler(svc *pricing.Service) *PriceCategoryHandler {
	return &PriceCategoryHandler{svc: svc}
}

func (h *PriceCategoryHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req pricing.CreatePriceCategoryRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	result, err := h.svc.CreatePriceCategory(r.Context(), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Created(w, result)
}

func (h *PriceCategoryHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	result, err := h.svc.GetPriceCategoryByID(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *PriceCategoryHandler) List(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.ListPriceCategories(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *PriceCategoryHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	var req pricing.CreatePriceCategoryRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	result, err := h.svc.UpdatePriceCategory(r.Context(), id, req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *PriceCategoryHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	if err := h.svc.DeletePriceCategory(r.Context(), id); err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, map[string]string{"status": "deleted"})
}

// Conversion Factor Handler

type ConversionFactorHandler struct {
	svc *pricing.Service
}

func NewConversionFactorHandler(svc *pricing.Service) *ConversionFactorHandler {
	return &ConversionFactorHandler{svc: svc}
}

func (h *ConversionFactorHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req pricing.CreateConversionFactorRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	result, err := h.svc.CreateConversionFactor(r.Context(), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.Created(w, result)
}

func (h *ConversionFactorHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	result, err := h.svc.GetConversionFactorByID(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *ConversionFactorHandler) ListByProductID(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	result, err := h.svc.ListConversionFactorsByProductID(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *ConversionFactorHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req pricing.CreateConversionFactorRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	result, err := h.svc.UpdateConversionFactor(r.Context(), id, req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *ConversionFactorHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.svc.DeleteConversionFactor(r.Context(), id); err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, map[string]string{"status": "deleted"})
}

// Measurement Unit Classification Handler

type MeasurementUnitClassificationHandler struct {
	svc *pricing.Service
}

func NewMeasurementUnitClassificationHandler(svc *pricing.Service) *MeasurementUnitClassificationHandler {
	return &MeasurementUnitClassificationHandler{svc: svc}
}

func (h *MeasurementUnitClassificationHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req pricing.CreateMeasurementUnitClassificationRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	result, err := h.svc.CreateMeasurementUnitClassification(r.Context(), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.Created(w, result)
}

func (h *MeasurementUnitClassificationHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	result, err := h.svc.GetMeasurementUnitClassificationByID(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *MeasurementUnitClassificationHandler) List(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.ListMeasurementUnitClassifications(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *MeasurementUnitClassificationHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req pricing.CreateMeasurementUnitClassificationRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	result, err := h.svc.UpdateMeasurementUnitClassification(r.Context(), id, req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *MeasurementUnitClassificationHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.svc.DeleteMeasurementUnitClassification(r.Context(), id); err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, map[string]string{"status": "deleted"})
}

// Measurement Unit Handler

type MeasurementUnitHandler struct {
	svc *pricing.Service
}

func NewMeasurementUnitHandler(svc *pricing.Service) *MeasurementUnitHandler {
	return &MeasurementUnitHandler{svc: svc}
}

func (h *MeasurementUnitHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req pricing.CreateMeasurementUnitRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	result, err := h.svc.CreateMeasurementUnit(r.Context(), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.Created(w, result)
}

func (h *MeasurementUnitHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	result, err := h.svc.GetMeasurementUnitByID(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *MeasurementUnitHandler) List(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.ListMeasurementUnits(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *MeasurementUnitHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req pricing.CreateMeasurementUnitRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	result, err := h.svc.UpdateMeasurementUnit(r.Context(), id, req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *MeasurementUnitHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chiURLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.svc.DeleteMeasurementUnit(r.Context(), id); err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, map[string]string{"status": "deleted"})
}

func chiURLParam(r *http.Request, key string) string {
	return chi.URLParam(r, key)
}

func validateImageFile(file multipart.File, header *multipart.FileHeader) (string, error) {
	ext := strings.ToLower(filepath.Ext(header.Filename))
	mimeType := header.Header.Get("Content-Type")

	expectedExt, ok := allowedMimeTypes[mimeType]
	if !ok {
		return "", fmt.Errorf("unsupported file type: %s", mimeType)
	}
	if ext != expectedExt && ext != ".jpeg" {
		return "", fmt.Errorf("file extension %s does not match content type %s", ext, mimeType)
	}
	if ext == ".jpeg" {
		ext = ".jpg"
	}

	buf := make([]byte, 12)
	n, err := file.Read(buf)
	if err != nil && n == 0 {
		return "", fmt.Errorf("failed to read file for validation")
	}
	file.Seek(0, 0)

	detected := detectImageType(buf[:n])
	if detected == "" {
		return "", fmt.Errorf("file content does not match a supported image format")
	}
	if detected != ext && !(detected == ".jpg" && ext == ".jpg") {
		return "", fmt.Errorf("file content (%s) does not match declared extension (%s)", detected, ext)
	}

	return ext, nil
}

func detectImageType(header []byte) string {
	if len(header) < 4 {
		return ""
	}
	switch {
	case header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF:
		return ".jpg"
	case header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47:
		return ".png"
	case header[0] == 0x47 && header[1] == 0x49 && header[2] == 0x46:
		return ".gif"
	case len(header) >= 12 && string(header[0:4]) == "RIFF" && string(header[8:12]) == "WEBP":
		return ".webp"
	case header[0] == 0x00 && header[1] == 0x00 && header[2] == 0x01 && header[3] == 0x00:
		return ".ico"
	default:
		return ""
	}
}

func saveUploadedFile(file multipart.File, ext, subDir string) (string, error) {
	filename := uuid.New().String() + ext
	saveDir := filepath.Join(staticImgDir, subDir)
	if err := os.MkdirAll(saveDir, 0755); err != nil {
		return "", fmt.Errorf("create directory: %w", err)
	}
	path := filepath.Join(saveDir, filename)

	file.Seek(0, 0)
	img, err := decodeImage(file, ext)
	if err != nil {
		// Unsupported format for processing, save as-is
		file.Seek(0, 0)
		out, err := os.Create(path)
		if err != nil {
			return "", fmt.Errorf("create file: %w", err)
		}
		defer out.Close()
		if _, err := io.Copy(out, file); err != nil {
			return "", fmt.Errorf("write file: %w", err)
		}
		return "/static/img/" + subDir + "/" + filename, nil
	}

	// Resize if larger than 1200px width
	bounds := img.Bounds()
	if bounds.Dx() > 1200 {
		img = resize.Resize(1200, 0, img, resize.Lanczos3)
	}

	// Encode with compression
	var buf bytes.Buffer
	if err := encodeImage(&buf, img, ext); err != nil {
		return "", fmt.Errorf("encode image: %w", err)
	}

	if err := os.WriteFile(path, buf.Bytes(), 0644); err != nil {
		return "", fmt.Errorf("write file: %w", err)
	}

	return "/static/img/" + subDir + "/" + filename, nil
}

func deleteOldFile(oldImg string) {
	filename := strings.TrimPrefix(oldImg, "/static/img/")
	fullPath := filepath.Join(staticImgDir, filepath.Clean(filename))
	if !strings.HasPrefix(filepath.Clean(fullPath), filepath.Clean(staticImgDir)) {
		return
	}
	os.Remove(fullPath)
}

func decodeImage(file multipart.File, ext string) (image.Image, error) {
	switch ext {
	case ".jpg", ".jpeg":
		return jpeg.Decode(file)
	case ".png":
		return png.Decode(file)
	case ".gif":
		return gif.Decode(file)
	case ".webp":
		return webp.Decode(file)
	default:
		return nil, fmt.Errorf("unsupported format: %s", ext)
	}
}

func encodeImage(w io.Writer, img image.Image, ext string) error {
	switch ext {
	case ".jpg", ".jpeg":
		return jpeg.Encode(w, img, &jpeg.Options{Quality: 80})
	case ".png":
		encoder := png.Encoder{CompressionLevel: png.BestCompression}
		return encoder.Encode(w, img)
	case ".gif":
		return gif.Encode(w, img, nil)
	default:
		return fmt.Errorf("unsupported format: %s", ext)
	}
}
