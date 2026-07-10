package rbac

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lcdpc/lcdpc-go/internal/http/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Resources

func (h *Handler) ListResources(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.ListResources(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *Handler) GetResource(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}
	result, err := h.svc.GetResource(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *Handler) CreateResource(w http.ResponseWriter, r *http.Request) {
	var req CreateResourceRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	result, err := h.svc.CreateResource(r.Context(), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.Created(w, result)
}

func (h *Handler) UpdateResource(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}
	var req UpdateResourceRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	result, err := h.svc.UpdateResource(r.Context(), id, req)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *Handler) DeleteResource(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}
	if err := h.svc.DeleteResource(r.Context(), id); err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, map[string]string{"status": "deleted"})
}

// Roles

func (h *Handler) ListRoles(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.ListRoles(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *Handler) GetRole(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}
	result, err := h.svc.GetRole(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *Handler) CreateRole(w http.ResponseWriter, r *http.Request) {
	var req CreateRoleRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	result, err := h.svc.CreateRole(r.Context(), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.Created(w, result)
}

func (h *Handler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}
	var req UpdateRoleRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	result, err := h.svc.UpdateRole(r.Context(), id, req)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *Handler) DeleteRole(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}
	if err := h.svc.DeleteRole(r.Context(), id); err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, map[string]string{"status": "deleted"})
}

func (h *Handler) AssignResourceToRole(w http.ResponseWriter, r *http.Request) {
	roleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}
	var req AssignResourceRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	if err := h.svc.AssignResourceToRole(r.Context(), roleID, req); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.Success(w, map[string]string{"status": "assigned"})
}

func (h *Handler) RemoveResourceFromRole(w http.ResponseWriter, r *http.Request) {
	roleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}
	resourceID, err := uuid.Parse(chi.URLParam(r, "resourceId"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"resourceId": "invalid uuid"})
		return
	}
	if err := h.svc.RemoveResourceFromRole(r.Context(), roleID, resourceID); err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, map[string]string{"status": "removed"})
}

// Profiles

func (h *Handler) ListProfiles(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.ListProfiles(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *Handler) GetProfile(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}
	result, err := h.svc.GetProfile(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *Handler) CreateProfile(w http.ResponseWriter, r *http.Request) {
	var req CreateProfileRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	result, err := h.svc.CreateProfile(r.Context(), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.Created(w, result)
}

func (h *Handler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}
	var req UpdateProfileRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	result, err := h.svc.UpdateProfile(r.Context(), id, req)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, result)
}

func (h *Handler) DeleteProfile(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}
	if err := h.svc.DeleteProfile(r.Context(), id); err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, map[string]string{"status": "deleted"})
}

func (h *Handler) AssignRoleToProfile(w http.ResponseWriter, r *http.Request) {
	profileID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}
	var req AssignRoleRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	if err := h.svc.AssignRoleToProfile(r.Context(), profileID, req); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.Success(w, map[string]string{"status": "assigned"})
}

func (h *Handler) RemoveRoleFromProfile(w http.ResponseWriter, r *http.Request) {
	profileID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}
	roleID, err := uuid.Parse(chi.URLParam(r, "roleId"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"roleId": "invalid uuid"})
		return
	}
	if err := h.svc.RemoveRoleFromProfile(r.Context(), profileID, roleID); err != nil {
		response.Error(w, http.StatusNotFound, err.Error())
		return
	}
	response.Success(w, map[string]string{"status": "removed"})
}

// Users

func (h *Handler) AssignProfileToUser(w http.ResponseWriter, r *http.Request) {
	userID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"id": "invalid uuid"})
		return
	}
	var req AssignProfileRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}
	if err := h.svc.AssignProfileToUser(r.Context(), userID, req.ProfileID); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.Success(w, map[string]string{"status": "assigned"})
}
