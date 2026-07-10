-- Registration Flow queries

-- name: GetRegistrationFlowByEmail :one
SELECT id, email, status, otp_code, otp_hash, verified_at_utc, otp_expires_at_utc, otp_attempts, otp_blocked_until_utc, created_at_utc, updated_at_utc
FROM registration_flows
WHERE email = $1
ORDER BY updated_at_utc DESC, created_at_utc DESC
LIMIT 1;

-- name: GetRegistrationFlowByID :one
SELECT id, email, status, otp_code, otp_hash, verified_at_utc, otp_expires_at_utc, otp_attempts, otp_blocked_until_utc, created_at_utc, updated_at_utc
FROM registration_flows
WHERE id = $1;

-- name: CreateRegistrationFlow :one
INSERT INTO registration_flows (id, email, status, otp_code, otp_hash, otp_expires_at_utc, otp_attempts, created_at_utc, updated_at_utc)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id;

-- name: UpdateRegistrationFlowOTP :exec
UPDATE registration_flows
SET status = $2, otp_code = $3, otp_hash = $4, otp_expires_at_utc = $5, otp_attempts = $6, otp_blocked_until_utc = $7, verified_at_utc = $8, updated_at_utc = now()
WHERE id = $1;

-- name: UpdateRegistrationFlowStatus :exec
UPDATE registration_flows
SET status = $2, verified_at_utc = $3, updated_at_utc = now()
WHERE id = $1;

-- name: IncrementRegistrationFlowOTPAttempts :one
UPDATE registration_flows
SET otp_attempts = otp_attempts + 1, updated_at_utc = now()
WHERE id = $1
RETURNING otp_attempts;

-- name: SetRegistrationFlowBlocked :exec
UPDATE registration_flows
SET status = $2, otp_blocked_until_utc = $3, updated_at_utc = now()
WHERE id = $1;

-- name: UpdateRegistrationFlowToProfilePending :exec
UPDATE registration_flows
SET status = $2, verified_at_utc = $3, updated_at_utc = now()
WHERE id = $1;

-- name: UpdateRegistrationFlowToActive :exec
UPDATE registration_flows
SET status = $2, updated_at_utc = now()
WHERE id = $1;

-- OAuth2 Client queries

-- name: GetOAuth2Client :one
SELECT client_id, client_name, redirect_uris, grant_types, require_pkce, allowed_scopes, created_at_utc
FROM oauth2_clients
WHERE client_id = $1;

-- name: CreateOAuth2Client :exec
INSERT INTO oauth2_clients (client_id, client_name, redirect_uris, grant_types, require_pkce, allowed_scopes, created_at_utc)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- OAuth2 Authorization Code queries

-- name: CreateOAuth2AuthCode :exec
INSERT INTO oauth2_authorization_codes (code, client_id, user_id, redirect_uri, scope, code_challenge, code_challenge_method, expires_at_utc, created_at_utc)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);

-- name: GetOAuth2AuthCode :one
SELECT code, client_id, user_id, redirect_uri, scope, code_challenge, code_challenge_method, expires_at_utc, used_at_utc, created_at_utc
FROM oauth2_authorization_codes
WHERE code = $1 AND expires_at_utc > now() AND used_at_utc IS NULL;

-- name: MarkOAuth2AuthCodeUsed :exec
UPDATE oauth2_authorization_codes SET used_at_utc = now() WHERE code = $1;

-- name: DeleteExpiredAuthCodes :exec
DELETE FROM oauth2_authorization_codes WHERE expires_at_utc < now() OR used_at_utc IS NOT NULL;

-- OAuth2 Refresh Token queries

-- name: CreateOAuth2RefreshToken :exec
INSERT INTO oauth2_refresh_tokens (token_hash, client_id, user_id, scope, family_id, previous_token_hash, expires_at_utc, created_at_utc)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: GetOAuth2RefreshToken :one
SELECT token_hash, client_id, user_id, scope, family_id, previous_token_hash, expires_at_utc, revoked_at_utc, created_at_utc
FROM oauth2_refresh_tokens
WHERE token_hash = $1 AND revoked_at_utc IS NULL AND expires_at_utc > now();

-- name: GetOAuth2RefreshTokenByHash :one
SELECT token_hash, client_id, user_id, scope, family_id, previous_token_hash, expires_at_utc, revoked_at_utc, created_at_utc
FROM oauth2_refresh_tokens
WHERE token_hash = $1;

-- name: RevokeOAuth2RefreshToken :exec
UPDATE oauth2_refresh_tokens SET revoked_at_utc = now() WHERE token_hash = $1;

-- name: RevokeOAuth2RefreshTokenFamily :exec
UPDATE oauth2_refresh_tokens SET revoked_at_utc = now() WHERE family_id = $1 AND revoked_at_utc IS NULL;

-- name: RevokeOAuth2RefreshTokensByUserID :exec
UPDATE oauth2_refresh_tokens SET revoked_at_utc = now() WHERE user_id = $1 AND revoked_at_utc IS NULL;

-- name: GetLatestRefreshTokenInFamily :one
SELECT token_hash, client_id, user_id, scope, family_id, previous_token_hash, expires_at_utc, revoked_at_utc, created_at_utc
FROM oauth2_refresh_tokens
WHERE family_id = $1
ORDER BY created_at_utc DESC
LIMIT 1;

-- RSA Key (stored as single row, no table needed - managed in-memory)
