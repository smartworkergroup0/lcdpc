package auth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/o1egl/paseto"
)

type OAuth2Service struct {
	pool    *pgxpool.Pool
	keySvc  *KeyService
	saKey   []byte
	tokenCfg TokenConfig
	accessTokenTTLMin    int
	refreshTokenTTLDays  int
	authCodeTTLMinutes   int
}

type OAuth2Config struct {
	AccessTokenTTLMin    int
	RefreshTokenTTLDays  int
	AuthCodeTTLMinutes   int
	Issuer               string
	Audience             string
}

func NewOAuth2Service(pool *pgxpool.Pool, keySvc *KeyService, saKey []byte, cfg OAuth2Config) *OAuth2Service {
	return &OAuth2Service{
		pool:  pool,
		keySvc: keySvc,
		saKey: saKey,
		tokenCfg: TokenConfig{
			Issuer:   cfg.Issuer,
			Audience: cfg.Audience,
			AccessTokenTTLMin: cfg.AccessTokenTTLMin,
		},
		accessTokenTTLMin:   cfg.AccessTokenTTLMin,
		refreshTokenTTLDays: cfg.RefreshTokenTTLDays,
		authCodeTTLMinutes:  cfg.AuthCodeTTLMinutes,
	}
}

// ClientCredentialsGrant (RFC 6749 §4.4)
func (s *OAuth2Service) ClientCredentialsGrant(ctx context.Context, clientID, clientSecret string) (*TokenResponse, *TokenErrorResponse) {
	if s.saKey == nil {
		return nil, &TokenErrorResponse{Error: "server_error", ErrorDescription: "Service account authentication is not configured."}
	}

	var sa struct {
		ID               uuid.UUID
		Username         string
		PasswordHash     string
		ProfileID        uuid.UUID
		TokenExpiryHours int
		IsActive         bool
	}

	err := s.pool.QueryRow(ctx, `
		SELECT id, username, password_hash, profile_id, token_expiry_hours, is_active
		FROM service_accounts WHERE username = $1 AND deleted_at_utc IS NULL
	`, clientID).Scan(&sa.ID, &sa.Username, &sa.PasswordHash, &sa.ProfileID, &sa.TokenExpiryHours, &sa.IsActive)
	if err != nil {
		return nil, &TokenErrorResponse{Error: "invalid_client", ErrorDescription: "Invalid client credentials."}
	}

	if !sa.IsActive {
		return nil, &TokenErrorResponse{Error: "invalid_client", ErrorDescription: "Service account is inactive."}
	}

	if !VerifyPassword(clientSecret, sa.PasswordHash) {
		return nil, &TokenErrorResponse{Error: "invalid_client", ErrorDescription: "Invalid client credentials."}
	}

	now := time.Now().UTC()
	expires := now.Add(time.Duration(sa.TokenExpiryHours) * time.Hour)

	claims := TokenClaims{
		Iss:       s.tokenCfg.Issuer,
		Aud:       s.tokenCfg.Audience,
		Sub:       sa.ID.String(),
		ProfileID: sa.ProfileID.String(),
		ClientID:  clientID,
		Email:     sa.Username,
		Iat:       now.Unix(),
		Exp:       expires.Unix(),
		Jti:       uuid.New().String(),
	}

	token, err := paseto.NewV2().Encrypt(s.saKey, claims, nil)
	if err != nil {
		return nil, &TokenErrorResponse{Error: "server_error", ErrorDescription: "Failed to generate access token."}
	}

	return &TokenResponse{
		AccessToken: token,
		TokenType:   "Bearer",
		ExpiresIn:   sa.TokenExpiryHours * 3600,
		Scope:       "",
	}, nil
}

// OAuth2 Client validation

type OAuth2Client struct {
	ClientID     string   `json:"client_id"`
	ClientName   string   `json:"client_name"`
	RedirectURIs []string `json:"redirect_uris"`
	GrantTypes   []string `json:"grant_types"`
	RequirePkce  bool     `json:"require_pkce"`
	AllowedScopes string  `json:"allowed_scopes"`
}

func (s *OAuth2Service) getClient(ctx context.Context, clientID string) (*OAuth2Client, error) {
	var client OAuth2Client
	var redirectURIsJSON, grantTypesJSON []byte

	err := s.pool.QueryRow(ctx, `
		SELECT client_id, client_name, redirect_uris, grant_types, require_pkce, allowed_scopes
		FROM oauth2_clients WHERE client_id = $1
	`, clientID).Scan(&client.ClientID, &client.ClientName, &redirectURIsJSON, &grantTypesJSON, &client.RequirePkce, &client.AllowedScopes)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get client: %w", err)
	}

	json.Unmarshal(redirectURIsJSON, &client.RedirectURIs)
	json.Unmarshal(grantTypesJSON, &client.GrantTypes)

	return &client, nil
}

func (s *OAuth2Service) validateRedirectURI(client *OAuth2Client, redirectURI string) bool {
	if redirectURI == "" {
		return false
	}
	for _, uri := range client.RedirectURIs {
		if uri == redirectURI {
			return true
		}
	}
	return false
}

func (s *OAuth2Service) validateScopes(client *OAuth2Client, requestedScopes string) bool {
	if requestedScopes == "" {
		return true
	}
	allowed := strings.Fields(client.AllowedScopes)
	requested := strings.Fields(requestedScopes)
	for _, r := range requested {
		found := false
		for _, a := range allowed {
			if a == r {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

// Authorize (RFC 6749 §4.1.1)

type AuthorizeRequest struct {
	ClientID            string `json:"client_id"`
	RedirectURI         string `json:"redirect_uri"`
	ResponseType        string `json:"response_type"`
	Scope               string `json:"scope"`
	State               string `json:"state"`
	CodeChallenge       string `json:"code_challenge"`
	CodeChallengeMethod string `json:"code_challenge_method"`
}

type AuthorizeResult struct {
	Success         bool   `json:"success"`
	RedirectURL     string `json:"redirect_url,omitempty"`
	ErrorCode       string `json:"error_code,omitempty"`
	ErrorDescription string `json:"error_description,omitempty"`
}

func (s *OAuth2Service) Authorize(ctx context.Context, req AuthorizeRequest, userID *uuid.UUID) (*AuthorizeResult, error) {
	client, err := s.getClient(ctx, req.ClientID)
	if err != nil {
		return nil, err
	}
	if client == nil {
		return &AuthorizeResult{Success: false, ErrorCode: "invalid_client", ErrorDescription: "The client_id is not registered."}, nil
	}

	if !s.validateRedirectURI(client, req.RedirectURI) {
		return &AuthorizeResult{Success: false, ErrorCode: "invalid_redirect_uri", ErrorDescription: "The redirect_uri is not registered for this client."}, nil
	}

	if req.ResponseType != "code" {
		return s.buildErrorRedirect(req.RedirectURI, req.State, "unsupported_response_type", "Only authorization_code (code) response type is supported."), nil
	}

	if !s.validateScopes(client, req.Scope) {
		return s.buildErrorRedirect(req.RedirectURI, req.State, "invalid_scope", "One or more requested scopes are not allowed for this client."), nil
	}

	if client.RequirePkce {
		if req.CodeChallenge == "" {
			return s.buildErrorRedirect(req.RedirectURI, req.State, "invalid_request", "PKCE is required for this client. code_challenge is missing."), nil
		}
		if req.CodeChallengeMethod != "S256" {
			return s.buildErrorRedirect(req.RedirectURI, req.State, "invalid_request", "Only S256 code_challenge_method is supported."), nil
		}
	}

	if userID == nil {
		return s.buildErrorRedirect(req.RedirectURI, req.State, "login_required", "User authentication is required."), nil
	}

	rawCode, err := GenerateOpaqueToken()
	if err != nil {
		return nil, fmt.Errorf("generate code: %w", err)
	}
	codeHash := HashToken(rawCode)

	now := time.Now().UTC()
	_, err = s.pool.Exec(ctx, `
		INSERT INTO oauth2_authorization_codes (code, client_id, user_id, redirect_uri, scope, code_challenge, code_challenge_method, expires_at_utc, created_at_utc)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, codeHash, req.ClientID, *userID, req.RedirectURI, req.Scope, req.CodeChallenge, req.CodeChallengeMethod,
		now.Add(time.Duration(s.authCodeTTLMinutes)*time.Minute), now)
	if err != nil {
		return nil, fmt.Errorf("save auth code: %w", err)
	}

	redirectURL := fmt.Sprintf("%s?code=%s&state=%s", req.RedirectURI, url.QueryEscape(rawCode), url.QueryEscape(req.State))

	return &AuthorizeResult{Success: true, RedirectURL: redirectURL}, nil
}

func (s *OAuth2Service) buildErrorRedirect(redirectURI, state, errorCode, errorDesc string) *AuthorizeResult {
	separator := "?"
	if strings.Contains(redirectURI, "?") {
		separator = "&"
	}
	u := fmt.Sprintf("%s%serror=%s&error_description=%s", redirectURI, separator, url.QueryEscape(errorCode), url.QueryEscape(errorDesc))
	if state != "" {
		u += "&state=" + url.QueryEscape(state)
	}
	return &AuthorizeResult{Success: false, RedirectURL: u, ErrorCode: errorCode, ErrorDescription: errorDesc}
}

// Token (RFC 6749 §4.1.3)

type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	Scope        string `json:"scope"`
}

type TokenErrorResponse struct {
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

func (s *OAuth2Service) ExchangeCode(ctx context.Context, code, codeVerifier, redirectURI, clientID string) (*TokenResponse, *TokenErrorResponse) {
	client, err := s.getClient(ctx, clientID)
	if err != nil || client == nil {
		return nil, &TokenErrorResponse{Error: "invalid_client", ErrorDescription: "Client not found."}
	}

	codeHash := HashToken(code)

	var authCode struct {
		Code              string
		ClientID          string
		UserID            uuid.UUID
		RedirectURI       string
		Scope             string
		CodeChallenge     string
		CodeChallengeMethod string
		ExpiresAtUtc      time.Time
		UsedAtUtc         *time.Time
	}

	err = s.pool.QueryRow(ctx, `
		SELECT code, client_id, user_id, redirect_uri, scope, code_challenge, code_challenge_method, expires_at_utc, used_at_utc
		FROM oauth2_authorization_codes WHERE code = $1
	`, codeHash).Scan(&authCode.Code, &authCode.ClientID, &authCode.UserID, &authCode.RedirectURI,
		&authCode.Scope, &authCode.CodeChallenge, &authCode.CodeChallengeMethod, &authCode.ExpiresAtUtc, &authCode.UsedAtUtc)
	if err != nil {
		return nil, &TokenErrorResponse{Error: "invalid_grant", ErrorDescription: "Authorization code not found."}
	}

	now := time.Now().UTC()
	if authCode.UsedAtUtc != nil || authCode.ExpiresAtUtc.Before(now) ||
		authCode.ClientID != clientID || authCode.RedirectURI != redirectURI {
		return nil, &TokenErrorResponse{Error: "invalid_grant", ErrorDescription: "Authorization code is invalid or expired."}
	}

	// PKCE validation
	if client.RequirePkce || authCode.CodeChallenge != "" {
		if codeVerifier == "" {
			return nil, &TokenErrorResponse{Error: "invalid_grant", ErrorDescription: "code_verifier is required for PKCE."}
		}
		verifierHash := sha256.Sum256([]byte(codeVerifier))
		computedChallenge := base64.RawURLEncoding.EncodeToString(verifierHash[:])
		if computedChallenge != authCode.CodeChallenge {
			return nil, &TokenErrorResponse{Error: "invalid_grant", ErrorDescription: "PKCE verification failed."}
		}
	}

	// Get user email for PASETO token
	var email string
	s.pool.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, authCode.UserID).Scan(&email)

	// Get profile ID + branch ID
	var profileID uuid.UUID
	var branchID *uuid.UUID
	s.pool.QueryRow(ctx, `SELECT profile_id, branch_id FROM users WHERE id = $1`, authCode.UserID).Scan(&profileID, &branchID)

	accessToken, err := GenerateAccessToken(s.keySvc.Key(), s.tokenCfg, authCode.UserID, profileID, branchID, clientID, authCode.Scope, email)
	if err != nil {
		return nil, &TokenErrorResponse{Error: "server_error", ErrorDescription: "Failed to generate access token."}
	}

	refreshToken, err := GenerateOpaqueToken()
	if err != nil {
		return nil, &TokenErrorResponse{Error: "server_error", ErrorDescription: "Failed to generate refresh token."}
	}
	refreshTokenHash := HashToken(refreshToken)
	familyID := uuid.New()

	_, err = s.pool.Exec(ctx, `
		INSERT INTO oauth2_refresh_tokens (token_hash, client_id, user_id, scope, family_id, previous_token_hash, expires_at_utc, created_at_utc)
		VALUES ($1, $2, $3, $4, $5, NULL, $6, $7)
	`, refreshTokenHash, clientID, authCode.UserID, authCode.Scope, familyID,
		now.Add(time.Duration(s.refreshTokenTTLDays)*24*time.Hour), now)
	if err != nil {
		return nil, &TokenErrorResponse{Error: "server_error", ErrorDescription: "Failed to store refresh token."}
	}

	s.pool.Exec(ctx, `UPDATE oauth2_authorization_codes SET used_at_utc = now() WHERE code = $1`, codeHash)

	return &TokenResponse{
		AccessToken:  accessToken,
		TokenType:    "Bearer",
		ExpiresIn:    s.accessTokenTTLMin * 60,
		RefreshToken: refreshToken,
		Scope:        authCode.Scope,
	}, nil
}

func (s *OAuth2Service) RefreshToken(ctx context.Context, refreshToken, clientID string) (*TokenResponse, *TokenErrorResponse) {
	client, err := s.getClient(ctx, clientID)
	if err != nil || client == nil {
		return nil, &TokenErrorResponse{Error: "invalid_client", ErrorDescription: "Client not found."}
	}

	refreshTokenHash := HashToken(refreshToken)

	var rt struct {
		TokenHash  string
		ClientID   string
		UserID     uuid.UUID
		Scope      string
		FamilyID   uuid.UUID
		ExpiresAt  time.Time
		RevokedAt  *time.Time
	}

	err = s.pool.QueryRow(ctx, `
		SELECT token_hash, client_id, user_id, scope, family_id, expires_at_utc, revoked_at_utc
		FROM oauth2_refresh_tokens WHERE token_hash = $1
	`, refreshTokenHash).Scan(&rt.TokenHash, &rt.ClientID, &rt.UserID, &rt.Scope, &rt.FamilyID, &rt.ExpiresAt, &rt.RevokedAt)
	if err != nil {
		return nil, &TokenErrorResponse{Error: "invalid_grant", ErrorDescription: "Refresh token not found."}
	}

	now := time.Now().UTC()
	if rt.RevokedAt != nil || rt.ExpiresAt.Before(now) {
		return nil, &TokenErrorResponse{Error: "invalid_grant", ErrorDescription: "Refresh token is revoked or expired."}
	}

	// Token theft detection: check if another token in this family has this as previous_token_hash
	var nextTokenExists bool
	err = s.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM oauth2_refresh_tokens
			WHERE family_id = $1 AND previous_token_hash = $2 AND token_hash != $2
		)
	`, rt.FamilyID, refreshTokenHash).Scan(&nextTokenExists)
	if err == nil && nextTokenExists {
		// Token theft detected - revoke entire family
		s.pool.Exec(ctx, `UPDATE oauth2_refresh_tokens SET revoked_at_utc = now() WHERE family_id = $1 AND revoked_at_utc IS NULL`, rt.FamilyID)
		return nil, &TokenErrorResponse{Error: "invalid_grant", ErrorDescription: "Token reuse detected. Family revoked."}
	}

	// Get user email
	var email string
	s.pool.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, rt.UserID).Scan(&email)

	// Get profile ID + branch ID
	var profileID uuid.UUID
	var branchID *uuid.UUID
	s.pool.QueryRow(ctx, `SELECT profile_id, branch_id FROM users WHERE id = $1`, rt.UserID).Scan(&profileID, &branchID)

	accessToken, err := GenerateAccessToken(s.keySvc.Key(), s.tokenCfg, rt.UserID, profileID, branchID, clientID, rt.Scope, email)
	if err != nil {
		return nil, &TokenErrorResponse{Error: "server_error", ErrorDescription: "Failed to generate access token."}
	}

	newRefreshToken, err := GenerateOpaqueToken()
	if err != nil {
		return nil, &TokenErrorResponse{Error: "server_error", ErrorDescription: "Failed to generate refresh token."}
	}
	newRefreshTokenHash := HashToken(newRefreshToken)

	_, err = s.pool.Exec(ctx, `
		INSERT INTO oauth2_refresh_tokens (token_hash, client_id, user_id, scope, family_id, previous_token_hash, expires_at_utc, created_at_utc)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, newRefreshTokenHash, clientID, rt.UserID, rt.Scope, rt.FamilyID, refreshTokenHash,
		now.Add(time.Duration(s.refreshTokenTTLDays)*24*time.Hour), now)
	if err != nil {
		return nil, &TokenErrorResponse{Error: "server_error", ErrorDescription: "Failed to store new refresh token."}
	}

	// Revoke old token
	s.pool.Exec(ctx, `UPDATE oauth2_refresh_tokens SET revoked_at_utc = now() WHERE token_hash = $1`, refreshTokenHash)

	return &TokenResponse{
		AccessToken:  accessToken,
		TokenType:    "Bearer",
		ExpiresIn:    s.accessTokenTTLMin * 60,
		RefreshToken: newRefreshToken,
		Scope:        rt.Scope,
	}, nil
}

// Introspect (RFC 7662)

type IntrospectResponse struct {
	Active    bool    `json:"active"`
	ClientID  *string `json:"client_id,omitempty"`
	Username  *string `json:"username,omitempty"`
	Scope     *string `json:"scope,omitempty"`
	Exp       *int64  `json:"exp,omitempty"`
	Iat       *int64  `json:"iat,omitempty"`
	Sub       *string `json:"sub,omitempty"`
}

func (s *OAuth2Service) Introspect(ctx context.Context, token string) (*IntrospectResponse, error) {
	// Try as PASETO access token
	claims, err := ValidatePasetoToken(token, s.keySvc.Key(), s.tokenCfg.Issuer, s.tokenCfg.Audience)
	if err == nil {
		return &IntrospectResponse{
			Active:   true,
			ClientID: &claims.ClientID,
			Username: &claims.Email,
			Scope:    &claims.Scope,
			Exp:      &claims.Exp,
			Iat:      &claims.Iat,
			Sub:      &claims.Sub,
		}, nil
	}

	// Try as refresh token
	tokenHash := HashToken(token)
	var rt struct {
		ClientID  string
		UserID    uuid.UUID
		Scope     string
		ExpiresAt time.Time
		CreatedAt time.Time
		RevokedAt *time.Time
	}

	err = s.pool.QueryRow(ctx, `
		SELECT client_id, user_id, scope, expires_at_utc, created_at_utc, revoked_at_utc
		FROM oauth2_refresh_tokens WHERE token_hash = $1
	`, tokenHash).Scan(&rt.ClientID, &rt.UserID, &rt.Scope, &rt.ExpiresAt, &rt.CreatedAt, &rt.RevokedAt)
	if err == nil {
		now := time.Now().UTC()
		isActive := rt.ExpiresAt.After(now) && rt.RevokedAt == nil
		exp := rt.ExpiresAt.Unix()
		iat := rt.CreatedAt.Unix()
		sub := rt.UserID.String()

		return &IntrospectResponse{
			Active:   isActive,
			ClientID: &rt.ClientID,
			Scope:    &rt.Scope,
			Exp:      &exp,
			Iat:      &iat,
			Sub:      &sub,
		}, nil
	}

	return &IntrospectResponse{Active: false}, nil
}

// Revoke (RFC 7009)

func (s *OAuth2Service) Revoke(ctx context.Context, token string) error {
	tokenHash := HashToken(token)

	var familyID uuid.UUID
	err := s.pool.QueryRow(ctx, `
		SELECT family_id FROM oauth2_refresh_tokens WHERE token_hash = $1
	`, tokenHash).Scan(&familyID)
	if err != nil {
		// RFC 7009: always return success, even if token doesn't exist
		return nil
	}

	// Revoke entire family
	_, err = s.pool.Exec(ctx, `
		UPDATE oauth2_refresh_tokens SET revoked_at_utc = now() WHERE family_id = $1 AND revoked_at_utc IS NULL
	`, familyID)
	return err
}
