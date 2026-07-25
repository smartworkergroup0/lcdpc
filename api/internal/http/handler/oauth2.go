package handler

import (
	"log/slog"
	"net/http"

	"github.com/google/uuid"
	"github.com/lcdpc/lcdpc-go/internal/auth"
	"github.com/lcdpc/lcdpc-go/internal/http/middleware"
	"github.com/lcdpc/lcdpc-go/internal/http/response"
)

type OAuth2Handler struct {
	oauth2Svc *auth.OAuth2Service
}

func NewOAuth2Handler(oauth2Svc *auth.OAuth2Service) *OAuth2Handler {
	return &OAuth2Handler{oauth2Svc: oauth2Svc}
}

func (h *OAuth2Handler) Authorize(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	clientID := q.Get("client_id")
	redirectURI := q.Get("redirect_uri")

	if clientID == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "error_description": "client_id is required"})
		return
	}
	if redirectURI == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "error_description": "redirect_uri is required"})
		return
	}

	// Resolve user from PASETO/cookie
	var userID *uuid.UUID
	if uidStr := middleware.GetUserID(r.Context()); uidStr != "" {
		if parsed, err := uuid.Parse(uidStr); err == nil {
			userID = &parsed
		}
	}

	result, err := h.oauth2Svc.Authorize(r.Context(), auth.AuthorizeRequest{
		ClientID:            clientID,
		RedirectURI:         redirectURI,
		ResponseType:        q.Get("response_type"),
		Scope:               q.Get("scope"),
		State:               q.Get("state"),
		CodeChallenge:       q.Get("code_challenge"),
		CodeChallengeMethod: q.Get("code_challenge_method"),
	}, userID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	if result.Success && result.RedirectURL != "" {
		http.Redirect(w, r, result.RedirectURL, http.StatusFound)
		return
	}

	if result.RedirectURL != "" {
		http.Redirect(w, r, result.RedirectURL, http.StatusFound)
		return
	}

	response.Fail(w, http.StatusBadRequest, map[string]string{
		"error":             result.ErrorCode,
		"error_description": result.ErrorDescription,
	})
}

func (h *OAuth2Handler) Token(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := response.Decode(r, &req); err != nil {
		slog.Warn("oauth2 token: invalid JSON body", "error", err)
		response.Fail(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "error_description": "invalid JSON body"})
		return
	}

	if req.Username == "" {
		slog.Warn("oauth2 token: missing username")
		response.Fail(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "error_description": "username is required"})
		return
	}
	if req.Password == "" {
		slog.Warn("oauth2 token: missing password", "username", req.Username)
		response.Fail(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "error_description": "password is required"})
		return
	}

	result, errResp := h.oauth2Svc.SALogin(r.Context(), req.Username, req.Password)
	if errResp != nil {
		slog.Warn("oauth2 token: authentication failed", "username", req.Username, "error", errResp.Error, "description", errResp.ErrorDescription)
		response.Fail(w, http.StatusUnauthorized, errResp)
		return
	}

	slog.Info("oauth2 token: authentication successful", "username", req.Username)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	response.Success(w, result)
}

func (h *OAuth2Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AccessToken string `json:"access_token"`
	}

	if err := response.Decode(r, &req); err != nil {
		slog.Warn("oauth2 refresh: invalid JSON body", "error", err)
		response.Fail(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "error_description": "invalid JSON body"})
		return
	}

	if req.AccessToken == "" {
		slog.Warn("oauth2 refresh: missing access_token")
		response.Fail(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "error_description": "access_token is required"})
		return
	}

	result, errResp := h.oauth2Svc.SARefresh(r.Context(), req.AccessToken)
	if errResp != nil {
		slog.Warn("oauth2 refresh: failed", "error", errResp.Error, "description", errResp.ErrorDescription)
		response.Fail(w, http.StatusUnauthorized, errResp)
		return
	}

	slog.Info("oauth2 refresh: successful")
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	response.Success(w, result)
}

func (h *OAuth2Handler) Introspect(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "error_description": "invalid form data"})
		return
	}

	token := r.FormValue("token")
	if token == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "error_description": "token is required"})
		return
	}

	result, err := h.oauth2Svc.Introspect(r.Context(), token)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	response.Success(w, result)
}

func (h *OAuth2Handler) Revoke(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		response.Fail(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "error_description": "invalid form data"})
		return
	}

	token := r.FormValue("token")
	if token == "" {
		response.Fail(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "error_description": "token is required"})
		return
	}

	// RFC 7009: always return 200
	h.oauth2Svc.Revoke(r.Context(), token)

	w.Header().Set("Content-Type", "application/json")
	response.Success(w, map[string]string{})
}
