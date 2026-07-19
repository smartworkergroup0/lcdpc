package assistant

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Client struct {
	httpClient *http.Client
	baseURL    string
	username   string
	password   string
	token      string
	expiresAt  time.Time
	mu         sync.RWMutex
}

func NewClient(baseURL, username, password string) *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		baseURL:    strings.TrimRight(baseURL, "/"),
		username:   username,
		password:   password,
	}
}

func (c *Client) ensureToken(ctx context.Context) error {
	c.mu.RLock()
	if c.token != "" && time.Now().Before(c.expiresAt) {
		c.mu.RUnlock()
		return nil
	}
	c.mu.RUnlock()

	c.mu.Lock()
	defer c.mu.Unlock()

	if c.token != "" && time.Now().Before(c.expiresAt) {
		return nil
	}

	body, _ := json.Marshal(map[string]string{
		"username": c.username,
		"password": c.password,
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/external/v1/auth/token/", strings.NewReader(string(body)))
	if err != nil {
		return fmt.Errorf("create auth request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("execute auth request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("auth failed (%d): %s", resp.StatusCode, string(respBody))
	}

	var authResp authResponse
	if err := json.NewDecoder(resp.Body).Decode(&authResp); err != nil {
		return fmt.Errorf("decode auth response: %w", err)
	}

	c.token = authResp.Access
	c.expiresAt = time.Now().Add(50 * time.Minute)
	return nil
}

func (c *Client) doRequest(ctx context.Context, method, path string, params url.Values) ([]byte, int, error) {
	if err := c.ensureToken(ctx); err != nil {
		return nil, 0, err
	}

	reqURL := c.baseURL + path
	if params != nil && len(params) > 0 {
		reqURL += "?" + params.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, method, reqURL, nil)
	if err != nil {
		return nil, 0, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read response: %w", err)
	}

	return respBody, resp.StatusCode, nil
}

func (c *Client) ListLeads(ctx context.Context, f ListFilter) ([]Lead, int, error) {
	params := url.Values{}
	if f.Search != nil && *f.Search != "" {
		params.Set("search", *f.Search)
	}
	if f.Status != nil && *f.Status != "" {
		params.Set("status", *f.Status)
	}
	if f.IsProcessed != nil {
		params.Set("is_processed", strconv.FormatBool(*f.IsProcessed))
	}
	if f.Limit > 0 {
		params.Set("limit", strconv.Itoa(f.Limit))
	}
	if f.Offset > 0 {
		params.Set("offset", strconv.Itoa(f.Offset))
	}

	body, status, err := c.doRequest(ctx, http.MethodGet, "/external/v1/leads/", params)
	if err != nil {
		return nil, 0, err
	}
	if status != http.StatusOK {
		return nil, 0, fmt.Errorf("list leads failed (%d): %s", status, string(body))
	}

	var result listResponse[Lead]
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, 0, fmt.Errorf("decode leads response: %w", err)
	}

	return result.Results, result.Count, nil
}

func (c *Client) ListOrders(ctx context.Context, f ListFilter) ([]Order, int, error) {
	params := url.Values{}
	if f.Search != nil && *f.Search != "" {
		params.Set("search", *f.Search)
	}
	if f.Status != nil && *f.Status != "" {
		params.Set("status", *f.Status)
	}
	if f.IsProcessed != nil {
		params.Set("is_processed", strconv.FormatBool(*f.IsProcessed))
	}
	if f.Limit > 0 {
		params.Set("limit", strconv.Itoa(f.Limit))
	}
	if f.Offset > 0 {
		params.Set("offset", strconv.Itoa(f.Offset))
	}

	body, status, err := c.doRequest(ctx, http.MethodGet, "/external/v1/orders/", params)
	if err != nil {
		return nil, 0, err
	}
	if status != http.StatusOK {
		return nil, 0, fmt.Errorf("list orders failed (%d): %s", status, string(body))
	}

	var result listResponse[Order]
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, 0, fmt.Errorf("decode orders response: %w", err)
	}

	return result.Results, result.Count, nil
}
