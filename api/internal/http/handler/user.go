package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lcdpc/lcdpc-go/internal/http/response"
	"github.com/lcdpc/lcdpc-go/internal/user"
)

type UserHandler struct {
	svc *user.Service
}

func NewUserHandler(svc *user.Service) *UserHandler {
	return &UserHandler{svc: svc}
}

func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	items, total, err := h.svc.List(r.Context(), limit, offset)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Paginated(w, items, total, limit, offset)
}

func (h *UserHandler) Search(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if q == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"q": "required"})
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	items, total, err := h.svc.Search(r.Context(), q, limit, offset)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Paginated(w, items, total, limit, offset)
}

func (h *UserHandler) GetByDocument(w http.ResponseWriter, r *http.Request) {
	doc := chi.URLParam(r, "doc")
	if doc == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"doc": "required"})
		return
	}

	u, err := h.svc.GetByDocument(r.Context(), doc)
	if err != nil {
		response.Error(w, http.StatusNotFound, "Usuario no encontrado")
		return
	}

	response.Success(w, u)
}

func (h *UserHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	u, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusNotFound, "Usuario no encontrado")
		return
	}

	response.Success(w, u)
}

func (h *UserHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	var req user.UpdateUserRequest
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
