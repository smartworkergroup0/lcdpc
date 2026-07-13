package handler

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/lcdpc/lcdpc-go/internal/auth"
	"github.com/lcdpc/lcdpc-go/internal/http/middleware"
	"github.com/lcdpc/lcdpc-go/internal/http/response"
)

type AuthHandler struct {
	svc *auth.Service
}

func NewAuthHandler(svc *auth.Service) *AuthHandler {
	return &AuthHandler{svc: svc}
}

func (h *AuthHandler) RegisterStart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"email": "invalid"})
		return
	}

	result, err := h.svc.StartRegistration(r.Context(), req.Email)
	if err != nil {
		response.Error(w, http.StatusConflict, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *AuthHandler) RegisterVerifyEmail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FlowID uuid.UUID `json:"flow_id"`
		Otp    string    `json:"otp"`
	}
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	result, err := h.svc.VerifyEmail(r.Context(), req.FlowID, req.Otp)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *AuthHandler) RegisterCheckDocument(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IdentityDocument string `json:"identity_document"`
	}
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"identity_document": "invalid"})
		return
	}

	result, err := h.svc.CheckDocumentAvailability(r.Context(), req.IdentityDocument)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	if !result.Available && result.Code == "DOCUMENT_ALREADY_LINKED_TO_USER" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(struct {
			Status  string `json:"status"`
			Code    string `json:"code,omitempty"`
			Message string `json:"message,omitempty"`
		}{Status: "error", Code: result.Code, Message: result.Message})
		return
	}

	response.Success(w, result)
}

func (h *AuthHandler) RegisterComplete(w http.ResponseWriter, r *http.Request) {
	var req auth.CompleteProfileRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	result, err := h.svc.CompleteProfile(r.Context(), req)
	if err != nil {
		if err.Error() == "DOCUMENT_ALREADY_LINKED_TO_USER" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			_ = json.NewEncoder(w).Encode(struct {
				Status  string `json:"status"`
				Code    string `json:"code,omitempty"`
				Message string `json:"message,omitempty"`
			}{Status: "error", Code: "DOCUMENT_ALREADY_LINKED_TO_USER", Message: "El documento que está intentando colocar se encuentra registrado a otro usuario."})
			return
		}
		response.Error(w, http.StatusConflict, err.Error())
		return
	}

	response.Created(w, result)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req auth.LoginRequest
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	result, err := h.svc.Login(r.Context(), req)
	if err != nil {
		response.Error(w, http.StatusUnauthorized, err.Error())
		return
	}

	// Set cookies for legacy compatibility
	http.SetCookie(w, &http.Cookie{
		Name:     "lcdpc_at",
		Value:    result.AccessToken,
		Path:     "/",
		HttpOnly: true,
		Secure:   false, // Set true in production with HTTPS
		SameSite: http.SameSiteLaxMode,
		MaxAge:   result.ExpiresIn,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     "lcdpc_rt",
		Value:    result.RefreshToken,
		Path:     "/",
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   30 * 24 * 60 * 60,
	})

	w.Header().Set("Deprecation", "true")
	w.Header().Set("Sunset", "Sat, 13 Sep 2026")
	response.Success(w, result)
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	accessToken := middleware.GetAccessToken(r.Context())
	if accessToken == "" {
		// Try cookie
		cookie, err := r.Cookie("lcdpc_at")
		if err == nil {
			accessToken = cookie.Value
		}
	}

	result, err := h.svc.Me(r.Context(), accessToken)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	// Try to get refresh token from cookie or body
	var refreshToken string

	cookie, err := r.Cookie("lcdpc_rt")
	if err == nil {
		refreshToken = cookie.Value
	}

	if refreshToken == "" {
		var req struct {
			RefreshToken string `json:"refresh_token"`
		}
		if err := response.Decode(r, &req); err == nil {
			refreshToken = req.RefreshToken
		}
	}

	result, err := h.svc.Refresh(r.Context(), refreshToken)
	if err != nil {
		response.Error(w, http.StatusUnauthorized, err.Error())
		return
	}

	// Set cookies
	http.SetCookie(w, &http.Cookie{
		Name:     "lcdpc_at",
		Value:    result.AccessToken,
		Path:     "/",
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   result.ExpiresIn,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     "lcdpc_rt",
		Value:    result.RefreshToken,
		Path:     "/",
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   30 * 24 * 60 * 60,
	})

	response.Success(w, result)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	accessToken := middleware.GetAccessToken(r.Context())
	if accessToken == "" {
		cookie, err := r.Cookie("lcdpc_at")
		if err == nil {
			accessToken = cookie.Value
		}
	}

	_ = h.svc.Logout(r.Context(), accessToken)

	// Clear cookies
	http.SetCookie(w, &http.Cookie{
		Name:     "lcdpc_at",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     "lcdpc_rt",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})

	response.Success(w, map[string]string{"status": "logged_out"})
}

func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"email": "invalid"})
		return
	}

	ip := r.RemoteAddr
	result, err := h.svc.ForgotPassword(r.Context(), req.Email, ip)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email       string `json:"email"`
		Otp         string `json:"otp"`
		NewPassword string `json:"new_password"`
	}
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	ip := r.RemoteAddr
	result, err := h.svc.ResetPassword(r.Context(), req.Email, req.Otp, req.NewPassword, ip)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *AuthHandler) GetSecurityPolicy(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.GetSecurityPolicy(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.Success(w, result)
}

func (h *AuthHandler) UpdateSecurityPolicy(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PasswordResetTTLMinutes       int  `json:"password_reset_ttl_minutes"`
		RevokeSessionsOnPasswordReset bool `json:"revoke_sessions_on_password_reset"`
	}
	if err := response.Decode(r, &req); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"body": "invalid"})
		return
	}

	result, err := h.svc.UpdateSecurityPolicy(r.Context(), req.PasswordResetTTLMinutes, req.RevokeSessionsOnPasswordReset)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.Success(w, result)
}
