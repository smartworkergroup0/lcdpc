package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lcdpc/lcdpc-go/internal/http/middleware"
	"github.com/lcdpc/lcdpc-go/internal/http/response"
	"github.com/lcdpc/lcdpc-go/internal/person"
)

type PersonHandler struct {
	svc *person.Service
}

func NewPersonHandler(svc *person.Service) *PersonHandler {
	return &PersonHandler{svc: svc}
}

func (h *PersonHandler) GetByDocument(w http.ResponseWriter, r *http.Request) {
	doc := chi.URLParam(r, "doc")
	if doc == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"doc": "required"})
		return
	}

	result, err := h.svc.GetByDocument(r.Context(), nil, doc)
	if err != nil {
		response.Error(w, http.StatusNotFound, "Persona no encontrada")
		return
	}

	response.Success(w, result)
}

func (h *PersonHandler) CreateClient(w http.ResponseWriter, r *http.Request) {
	var req person.UpsertRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	if req.Name == "" || req.IdentityDocument == "" || req.WhatsAppPhone == "" || req.FullAddress == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	result, err := h.svc.CreateClient(r.Context(), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *PersonHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	userIDStr := middleware.GetUserID(r.Context())
	if userIDStr == "" {
		response.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req person.UpsertRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	if req.Name == "" || req.IdentityDocument == "" || req.WhatsAppPhone == "" || req.FullAddress == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	result, err := h.svc.Upsert(r.Context(), req, &userID)
	if err != nil {
		if err.Error() == "PERSON_EXISTS" || err.Error() == "PERSON_ALREADY_LINKED" || err.Error() == "AUTH_REQUIRED" {
			response.Error(w, http.StatusConflict, err.Error())
			return
		}
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *PersonHandler) ListClients(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := person.ClientFilter{}

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
	if v := q.Get("search"); v != "" {
		f.Search = &v
	}

	items, total, err := h.svc.ListClients(r.Context(), f)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Paginated(w, items, total, f.GetLimit(), f.GetOffset())
}

func (h *PersonHandler) GetClientByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	result, err := h.svc.GetClientByID(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *PersonHandler) UpdateClient(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	var req person.UpsertRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	result, err := h.svc.UpdateClient(r.Context(), id, req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *PersonHandler) DeleteClient(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	if err := h.svc.DeleteClient(r.Context(), id); err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}

	response.Success(w, map[string]string{"status": "deleted"})
}
