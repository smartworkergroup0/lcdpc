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
	tokenTTL   time.Duration
	token      string
	expiresAt  time.Time
	mu         sync.RWMutex
}

func NewClient(baseURL, username, password string, tokenTTLMin int) *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		baseURL:    strings.TrimRight(baseURL, "/"),
		username:   username,
		password:   password,
		tokenTTL:   time.Duration(tokenTTLMin) * time.Minute,
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
	c.expiresAt = time.Now().Add(c.tokenTTL)
	return nil
}

func (c *Client) doRequest(ctx context.Context, method, path string, params url.Values) ([]byte, int, error) {
	if err := c.ensureToken(ctx); err != nil {
		return nil, 0, err
	}

	return c.doRequestWithToken(ctx, method, path, params, c.token)
}

func (c *Client) doRequestWithToken(ctx context.Context, method, path string, params url.Values, token string) ([]byte, int, error) {
	reqURL := c.baseURL + path
	if params != nil && len(params) > 0 {
		reqURL += "?" + params.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, method, reqURL, nil)
	if err != nil {
		return nil, 0, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode == http.StatusUnauthorized {
		c.mu.Lock()
		c.token = ""
		c.expiresAt = time.Time{}
		c.mu.Unlock()

		if err := c.ensureToken(ctx); err != nil {
			return nil, 0, err
		}
		return c.doRequestWithToken(ctx, method, path, params, c.token)
	}

	return respBody, resp.StatusCode, nil
}

func (c *Client) doPost(ctx context.Context, path string, body interface{}) ([]byte, int, error) {
	if err := c.ensureToken(ctx); err != nil {
		return nil, 0, err
	}
	return c.doPostWithToken(ctx, path, body, c.token)
}

func (c *Client) doPostWithToken(ctx context.Context, path string, body interface{}, token string) ([]byte, int, error) {
	var bodyReader io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, 0, fmt.Errorf("marshal body: %w", err)
		}
		bodyReader = strings.NewReader(string(jsonBody))
	}

	reqURL := c.baseURL + path
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, bodyReader)
	if err != nil {
		return nil, 0, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode == http.StatusUnauthorized {
		c.mu.Lock()
		c.token = ""
		c.expiresAt = time.Time{}
		c.mu.Unlock()

		if err := c.ensureToken(ctx); err != nil {
			return nil, 0, err
		}
		return c.doPostWithToken(ctx, path, body, c.token)
	}

	return respBody, resp.StatusCode, nil
}

func (c *Client) GetLeadByIdentification(ctx context.Context, identification string) (*Lead, error) {
	params := url.Values{}
	params.Set("user_identification", identification)

	body, status, err := c.doRequest(ctx, http.MethodGet, "/external/v1/leads/", params)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("get lead by identification failed (%d): %s", status, string(body))
	}

	var result listResponse[Lead]
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode leads response: %w", err)
	}
	if len(result.Results) == 0 {
		return nil, fmt.Errorf("LEAD_NOT_FOUND")
	}
	return &result.Results[0], nil
}

func (c *Client) ChangeOrderStatus(ctx context.Context, orderID string, status string) error {
	path := fmt.Sprintf("/external/v1/orders/%s/change_status/", orderID)
	reqBody := map[string]string{"status": status}

	respBody, statusCode, err := c.doPost(ctx, path, reqBody)
	if err != nil {
		return err
	}
	if statusCode != http.StatusOK && statusCode != http.StatusNoContent {
		return fmt.Errorf("change order status failed (%d): %s", statusCode, string(respBody))
	}
	return nil
}

func (c *Client) MarkOrderProcessed(ctx context.Context, orderID string) error {
	path := fmt.Sprintf("/external/v1/orders/%s/mark_processed/", orderID)

	respBody, statusCode, err := c.doPost(ctx, path, nil)
	if err != nil {
		return err
	}
	if statusCode != http.StatusOK && statusCode != http.StatusNoContent {
		return fmt.Errorf("mark order processed failed (%d): %s", statusCode, string(respBody))
	}
	return nil
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
	if f.UserIdentification != nil && *f.UserIdentification != "" {
		params.Set("user_identification", *f.UserIdentification)
	}

	page := 1
	if f.Offset > 0 {
		page = (f.Offset / 10) + 1
	}
	params.Set("page", strconv.Itoa(page))

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

	isProcessed := f.IsProcessed != nil && *f.IsProcessed
	for i := range result.Results {
		result.Results[i].IsProcessed = isProcessed
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

	page := 1
	if f.Offset > 0 {
		page = (f.Offset / 10) + 1
	}
	params.Set("page", strconv.Itoa(page))

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

	isProcessed := f.IsProcessed != nil && *f.IsProcessed
	for i := range result.Results {
		result.Results[i].IsProcessed = isProcessed
	}

	return result.Results, result.Count, nil
}
