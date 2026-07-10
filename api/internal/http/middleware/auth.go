package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/lcdpc/lcdpc-go/internal/auth"
	"github.com/lcdpc/lcdpc-go/internal/rbac"
)

type contextKey string

const (
	UserIDKey    contextKey = "user_id"
	ProfileIDKey contextKey = "profile_id"
	BranchIDKey  contextKey = "branch_id"
	TokenKey     contextKey = "access_token"
)

func PASETOAuth(key []byte, issuer, audience string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenString := extractToken(r)
			if tokenString == "" {
				next.ServeHTTP(w, r)
				return
			}

			claims, err := auth.ValidatePasetoToken(tokenString, key, issuer, audience)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			ctx := context.WithValue(r.Context(), UserIDKey, claims.Sub)
			ctx = context.WithValue(ctx, ProfileIDKey, claims.ProfileID)
			if claims.BranchID != "" {
				ctx = context.WithValue(ctx, BranchIDKey, claims.BranchID)
			}
			ctx = context.WithValue(ctx, TokenKey, tokenString)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireAuth() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := r.Context().Value(UserIDKey)
			if userID == nil || userID.(string) == "" {
				http.Error(w, `{"status":"error","message":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func RequirePermission(store *rbac.Store, resourceCode string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			profileIDStr := GetProfileID(r.Context())
			if profileIDStr == "" {
				http.Error(w, `{"status":"error","message":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			profileID, err := uuid.Parse(profileIDStr)
			if err != nil {
				http.Error(w, `{"status":"error","message":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			if !store.HasPermission(profileID, resourceCode) {
				http.Error(w, `{"status":"error","message":"insufficient_permissions"}`, http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func extractToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}

	cookie, err := r.Cookie("lcdpc_at")
	if err == nil && cookie.Value != "" {
		return cookie.Value
	}

	return ""
}

func GetUserID(ctx context.Context) string {
	if v, ok := ctx.Value(UserIDKey).(string); ok {
		return v
	}
	return ""
}

func GetProfileID(ctx context.Context) string {
	if v, ok := ctx.Value(ProfileIDKey).(string); ok {
		return v
	}
	return ""
}

func GetAccessToken(ctx context.Context) string {
	if v, ok := ctx.Value(TokenKey).(string); ok {
		return v
	}
	return ""
}

func GetBranchID(ctx context.Context) string {
	if v, ok := ctx.Value(BranchIDKey).(string); ok {
		return v
	}
	return ""
}

func ServiceAccountAuth(saKey []byte, issuer, audience string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenString := extractToken(r)
			if tokenString == "" {
				slog.Warn("service account auth: no token provided", "path", r.URL.Path)
				next.ServeHTTP(w, r)
				return
			}

			claims, err := auth.ValidatePasetoToken(tokenString, saKey, issuer, audience)
			if err != nil {
				slog.Warn("service account auth: invalid token", "error", err, "path", r.URL.Path)
				next.ServeHTTP(w, r)
				return
			}

			ctx := context.WithValue(r.Context(), UserIDKey, claims.Sub)
			ctx = context.WithValue(ctx, ProfileIDKey, claims.ProfileID)
			if claims.BranchID != "" {
				ctx = context.WithValue(ctx, BranchIDKey, claims.BranchID)
			}
			ctx = context.WithValue(ctx, TokenKey, tokenString)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func HasPermission(ctx context.Context, store *rbac.Store, resourceCode string) bool {
	profileIDStr := GetProfileID(ctx)
	if profileIDStr == "" {
		return false
	}
	profileID, err := uuid.Parse(profileIDStr)
	if err != nil {
		return false
	}
	return store.HasPermission(profileID, resourceCode)
}
