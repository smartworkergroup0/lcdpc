package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

const ApiKeyHeader = "X-API-TOKEN"

func APIKeyAuth(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			apiKey := r.Header.Get(ApiKeyHeader)
			if apiKey == "" {
				http.Error(w, `{"status":"error","message":"missing api key"}`, http.StatusUnauthorized)
				return
			}

			hash := sha256.Sum256([]byte(apiKey))
			tokenHash := hex.EncodeToString(hash[:])

			var exists bool
			err := pool.QueryRow(r.Context(), `
			SELECT EXISTS(SELECT 1 FROM api_tokens WHERE token_hash = $1 AND is_active = true)
		`, tokenHash).Scan(&exists)
			if err != nil || !exists {
				http.Error(w, `{"status":"error","message":"invalid api key"}`, http.StatusUnauthorized)
				return
			}

			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), "api_key_valid", true)))
		})
	}
}
