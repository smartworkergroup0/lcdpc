package handler

import (
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lcdpc/lcdpc-go/internal/http/response"
	"github.com/lcdpc/lcdpc-go/internal/systemconfig"
)

var allowedLogoExtensions = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".webp": true,
	".gif":  true,
}

func validateLogoFile(file multipart.File, header *multipart.FileHeader) (string, error) {
	ext, err := validateImageFile(file, header)
	if err != nil {
		return "", err
	}
	if !allowedLogoExtensions[ext] {
		return "", fmt.Errorf("logo must be an image file (jpg, png, webp, gif), got %s", ext)
	}
	return ext, nil
}

func validateIconFile(file multipart.File, header *multipart.FileHeader) (string, error) {
	ext, err := validateImageFile(file, header)
	if err != nil {
		return "", err
	}
	if ext != ".ico" {
		return "", fmt.Errorf("icon must be a .ico file, got %s", ext)
	}
	return ext, nil
}

type SystemConfigHandler struct {
	svc *systemconfig.Service
}

func NewSystemConfigHandler(svc *systemconfig.Service) *SystemConfigHandler {
	return &SystemConfigHandler{svc: svc}
}

func (h *SystemConfigHandler) List(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.List(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *SystemConfigHandler) Create(w http.ResponseWriter, r *http.Request) {
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

	var req systemconfig.CreateSystemConfigRequest
	if err := json.Unmarshal([]byte(dataStr), &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"data": "invalid json"})
		return
	}

	logoFile, logoHeader, _ := r.FormFile("logo")
	if logoFile != nil {
		defer logoFile.Close()
		ext, err := validateLogoFile(logoFile, logoHeader)
		if err != nil {
			response.Fail(w, http.StatusBadRequest, map[string]string{"logo": err.Error()})
			return
		}
		newPath, err := saveUploadedFile(logoFile, ext, "config")
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "failed to save logo")
			return
		}
		req.LogoPath = &newPath
	}

	iconFile, iconHeader, _ := r.FormFile("icon")
	if iconFile != nil {
		defer iconFile.Close()
		ext, err := validateIconFile(iconFile, iconHeader)
		if err != nil {
			response.Fail(w, http.StatusBadRequest, map[string]string{"icon": err.Error()})
			return
		}
		newPath, err := saveUploadedFile(iconFile, ext, "config")
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "failed to save icon")
			return
		}
		req.IconPath = &newPath
	}

	result, err := h.svc.Create(r.Context(), req)
	if err != nil {
		if logoFile != nil && req.LogoPath != nil {
			deleteOldFile(*req.LogoPath)
		}
		if iconFile != nil && req.IconPath != nil {
			deleteOldFile(*req.IconPath)
		}
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Created(w, result)
}

func (h *SystemConfigHandler) GetActive(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.GetActive(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *SystemConfigHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
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

	var req systemconfig.UpdateSystemConfigRequest
	if err := json.Unmarshal([]byte(dataStr), &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"data": "invalid json"})
		return
	}

	logoFile, logoHeader, _ := r.FormFile("logo")
	if logoFile != nil {
		defer logoFile.Close()
		ext, err := validateLogoFile(logoFile, logoHeader)
		if err != nil {
			response.Fail(w, http.StatusBadRequest, map[string]string{"logo": err.Error()})
			return
		}
		newPath, err := saveUploadedFile(logoFile, ext, "config")
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "failed to save logo")
			return
		}
		old, _ := h.svc.GetByID(r.Context(), id)
		if old != nil && old.LogoPath != nil && *old.LogoPath != "" {
			deleteOldFile(*old.LogoPath)
		}
		req.LogoPath = &newPath
	}

	iconFile, iconHeader, _ := r.FormFile("icon")
	if iconFile != nil {
		defer iconFile.Close()
		ext, err := validateIconFile(iconFile, iconHeader)
		if err != nil {
			response.Fail(w, http.StatusBadRequest, map[string]string{"icon": err.Error()})
			return
		}
		newPath, err := saveUploadedFile(iconFile, ext, "config")
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "failed to save icon")
			return
		}
		old, _ := h.svc.GetByID(r.Context(), id)
		if old != nil && old.IconPath != nil && *old.IconPath != "" {
			deleteOldFile(*old.IconPath)
		}
		req.IconPath = &newPath
	}

	result, err := h.svc.Update(r.Context(), id, req)
	if err != nil {
		if logoFile != nil && req.LogoPath != nil {
			deleteOldFile(*req.LogoPath)
		}
		if iconFile != nil && req.IconPath != nil {
			deleteOldFile(*req.IconPath)
		}
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *SystemConfigHandler) GetLogo(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.GetActive(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, map[string]*string{"logo_path": result.LogoPath})
}

func (h *SystemConfigHandler) GetIcon(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.GetActive(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, map[string]*string{"icon_path": result.IconPath})
}

func (h *SystemConfigHandler) GetPageName(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.GetActive(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, map[string]string{"page_name": result.PageName})
}

func (h *SystemConfigHandler) GetShowPrice(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.GetActive(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, map[string]bool{"show_price_in_catalog": result.ShowPriceInCatalog})
}

func (h *SystemConfigHandler) GetTitle(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.GetActive(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, map[string]string{"title": result.Title})
}

func (h *SystemConfigHandler) GetNegativeStock(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.GetActive(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, map[string]bool{"negative_stock": result.NegativeStock})
}
