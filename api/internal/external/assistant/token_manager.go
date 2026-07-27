package assistant

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type tokenEntry struct {
	token     string
	expiresAt time.Time
	mu        sync.Mutex
}

type TokenManager struct {
	pool    *pgxpool.Pool
	baseURL string
	ttlMin  int
	entries map[uuid.UUID]*tokenEntry
	mapMu   sync.RWMutex
}

func NewTokenManager(pool *pgxpool.Pool, baseURL string, ttlMin int) *TokenManager {
	return &TokenManager{
		pool:    pool,
		baseURL: strings.TrimRight(baseURL, "/"),
		ttlMin:  ttlMin,
		entries: make(map[uuid.UUID]*tokenEntry),
	}
}

func (tm *TokenManager) GetToken(ctx context.Context, accountID uuid.UUID) (string, error) {
	tm.mapMu.RLock()
	entry, exists := tm.entries[accountID]
	tm.mapMu.RUnlock()

	if exists {
		entry.mu.Lock()
		if entry.token != "" && time.Now().Before(entry.expiresAt) {
			token := entry.token
			entry.mu.Unlock()
			return token, nil
		}
		entry.mu.Unlock()
	}

	tm.mapMu.Lock()
	entry, exists = tm.entries[accountID]
	if !exists {
		entry = &tokenEntry{}
		tm.entries[accountID] = entry
	}
	tm.mapMu.Unlock()

	entry.mu.Lock()
	defer entry.mu.Unlock()

	if entry.token != "" && time.Now().Before(entry.expiresAt) {
		return entry.token, nil
	}

	var username, password string
	err := tm.pool.QueryRow(ctx, `
		SELECT username, password FROM assistant_service_accounts
		WHERE id = $1 AND deleted_at_utc IS NULL AND is_active = true
	`, accountID).Scan(&username, &password)
	if err != nil {
		return "", fmt.Errorf("get assistant session credentials: %w", err)
	}

	body, _ := json.Marshal(map[string]string{
		"username": username,
		"password": password,
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		tm.baseURL+"/external/v1/auth/token/", strings.NewReader(string(body)))
	if err != nil {
		return "", fmt.Errorf("create auth request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("execute auth request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("auth failed (%d): %s", resp.StatusCode, string(respBody))
	}

	var authResp struct {
		Access string `json:"access"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&authResp); err != nil {
		return "", fmt.Errorf("decode auth response: %w", err)
	}

	entry.token = authResp.Access
	entry.expiresAt = time.Now().Add(time.Duration(tm.ttlMin) * time.Minute)
	return entry.token, nil
}

func (tm *TokenManager) InvalidateToken(accountID uuid.UUID) {
	tm.mapMu.RLock()
	entry, exists := tm.entries[accountID]
	tm.mapMu.RUnlock()

	if exists {
		entry.mu.Lock()
		entry.token = ""
		entry.expiresAt = time.Time{}
		entry.mu.Unlock()
	}
}
