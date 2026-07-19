package auth

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	StatusPendingEmailVerification = "pending_email_verification"
	StatusPendingProfile           = "pending_profile"
	StatusOtpAttemptsExceeded      = "otp_attempts_exceeded"
	StatusActive                   = "active"

	OtpTTLMinutes      = 10
	OtpMaxAttempts     = 5
	OtpCooldownMinutes = 10
)

type Service struct {
	pool      *pgxpool.Pool
	emailSvc  emailSender
	keySvc    *KeyService
	tokenCfg  TokenConfig
	rbacStore rbacStore
}

type emailSender interface {
	SendOtpAsync(ctx context.Context, to, otp string) error
	SendPasswordResetAsync(ctx context.Context, to, otp string, ttlMinutes int) error
}

type rbacStore interface {
	HasPermission(profileID uuid.UUID, resourceCode string) bool
	GetPermissions(profileID uuid.UUID) []string
}

type Config struct {
	PasswordResetTTLMinutes       int
	RevokeSessionsOnPasswordReset bool
	OAuth2Issuer                  string
	OAuth2Audience                string
	AccessTokenTTLMin             int
}

func NewService(pool *pgxpool.Pool, emailSvc emailSender, keySvc *KeyService, cfg Config, rbacStore rbacStore) *Service {
	return &Service{
		pool:     pool,
		emailSvc: emailSvc,
		keySvc:   keySvc,
		tokenCfg: TokenConfig{
			Issuer:            cfg.OAuth2Issuer,
			Audience:          cfg.OAuth2Audience,
			AccessTokenTTLMin: cfg.AccessTokenTTLMin,
		},
		rbacStore: rbacStore,
	}
}

// Registration Flow

type StartRegistrationResponse struct {
	FlowID    uuid.UUID `json:"flow_id"`
	Status    string    `json:"status"`
	OtpPolicy OtpPolicy `json:"otp_policy"`
}

type OtpPolicy struct {
	TTLMinutes  int `json:"ttl_minutes"`
	MaxAttempts int `json:"max_attempts"`
	CooldownMin int `json:"cooldown_minutes"`
}

func (s *Service) StartRegistration(ctx context.Context, email string) (*StartRegistrationResponse, error) {
	normalizedEmail := normalizeEmail(email)
	now := time.Now().UTC()

	var exists bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`, normalizedEmail).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("check user exists: %w", err)
	}
	if exists {
		return nil, fmt.Errorf("EMAIL_ALREADY_REGISTERED")
	}

	var flowID uuid.UUID
	var flowStatus string
	var flowOtpBlockedUntil *time.Time

	err = s.pool.QueryRow(ctx, `
		SELECT id, status, otp_blocked_until_utc FROM registration_flows
		WHERE email = $1 ORDER BY updated_at_utc DESC, created_at_utc DESC LIMIT 1
	`, normalizedEmail).Scan(&flowID, &flowStatus, &flowOtpBlockedUntil)

	if err == pgx.ErrNoRows {
		flowID = uuid.New()
		otpCode := GenerateOtp()
		otpHash := HashOtp(otpCode)

		_, err = s.pool.Exec(ctx, `
			INSERT INTO registration_flows (id, email, status, otp_code, otp_hash, otp_expires_at_utc, otp_attempts, created_at_utc, updated_at_utc)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		`, flowID, normalizedEmail, StatusPendingEmailVerification, otpCode, otpHash,
			now.Add(OtpTTLMinutes*time.Minute), 0, now, now)
		if err != nil {
			return nil, fmt.Errorf("create flow: %w", err)
		}

		if err := s.emailSvc.SendOtpAsync(ctx, normalizedEmail, otpCode); err != nil {
			slog.Error("failed to send OTP", "error", err)
		}

		return &StartRegistrationResponse{
			FlowID:    flowID,
			Status:    StatusPendingEmailVerification,
			OtpPolicy: OtpPolicy{TTLMinutes: OtpTTLMinutes, MaxAttempts: OtpMaxAttempts, CooldownMin: OtpCooldownMinutes},
		}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get flow: %w", err)
	}

	if flowStatus == StatusPendingProfile {
		// Reset OTP
		otpCode := GenerateOtp()
		otpHash := HashOtp(otpCode)
		_, err = s.pool.Exec(ctx, `
			UPDATE registration_flows SET status = $2, otp_code = $3, otp_hash = $4, otp_expires_at_utc = $5, otp_attempts = 0, otp_blocked_until_utc = NULL, verified_at_utc = NULL, updated_at_utc = now()
			WHERE id = $1
		`, flowID, StatusPendingEmailVerification, otpCode, otpHash, now.Add(OtpTTLMinutes*time.Minute))
		if err != nil {
			return nil, fmt.Errorf("reset flow: %w", err)
		}

		if err := s.emailSvc.SendOtpAsync(ctx, normalizedEmail, otpCode); err != nil {
			slog.Error("failed to send OTP", "error", err)
		}

		return &StartRegistrationResponse{
			FlowID:    flowID,
			Status:    StatusPendingEmailVerification,
			OtpPolicy: OtpPolicy{TTLMinutes: OtpTTLMinutes, MaxAttempts: OtpMaxAttempts, CooldownMin: OtpCooldownMinutes},
		}, nil
	}

	if flowStatus == StatusOtpAttemptsExceeded && flowOtpBlockedUntil != nil && flowOtpBlockedUntil.After(now) {
		return nil, fmt.Errorf("OTP_COOLDOWN_ACTIVE")
	}

	if flowStatus == StatusActive {
		return nil, fmt.Errorf("EMAIL_ALREADY_REGISTERED")
	}

	// Reset OTP
	otpCode := GenerateOtp()
	otpHash := HashOtp(otpCode)
	_, err = s.pool.Exec(ctx, `
		UPDATE registration_flows SET status = $2, otp_code = $3, otp_hash = $4, otp_expires_at_utc = $5, otp_attempts = 0, otp_blocked_until_utc = NULL, verified_at_utc = NULL, updated_at_utc = now()
		WHERE id = $1
	`, flowID, StatusPendingEmailVerification, otpCode, otpHash, now.Add(OtpTTLMinutes*time.Minute))
	if err != nil {
		return nil, fmt.Errorf("reset flow: %w", err)
	}

	if err := s.emailSvc.SendOtpAsync(ctx, normalizedEmail, otpCode); err != nil {
		slog.Error("failed to send OTP", "error", err)
	}

	return &StartRegistrationResponse{
		FlowID:    flowID,
		Status:    StatusPendingEmailVerification,
		OtpPolicy: OtpPolicy{TTLMinutes: OtpTTLMinutes, MaxAttempts: OtpMaxAttempts, CooldownMin: OtpCooldownMinutes},
	}, nil
}

type VerifyEmailResponse struct {
	FlowID uuid.UUID `json:"flow_id"`
	Status string    `json:"status"`
}

func (s *Service) VerifyEmail(ctx context.Context, flowID uuid.UUID, otp string) (*VerifyEmailResponse, error) {
	now := time.Now().UTC()

	var flow struct {
		ID              uuid.UUID
		Status          string
		OtpHash         string
		OtpExpiresAtUtc time.Time
		OtpAttempts     int
	}

	err := s.pool.QueryRow(ctx, `
		SELECT id, status, otp_hash, otp_expires_at_utc, otp_attempts FROM registration_flows WHERE id = $1
	`, flowID).Scan(&flow.ID, &flow.Status, &flow.OtpHash, &flow.OtpExpiresAtUtc, &flow.OtpAttempts)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("FLOW_NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get flow: %w", err)
	}

	if flow.Status == StatusPendingProfile {
		// Reset and expire
		s.resetOTP(ctx, flowID, now)
		return nil, fmt.Errorf("OTP_EXPIRED")
	}

	if flow.Status != StatusPendingEmailVerification {
		return nil, fmt.Errorf("FLOW_INVALID_STATUS")
	}

	if flow.OtpExpiresAtUtc.Before(now) {
		s.resetOTP(ctx, flowID, now)
		return nil, fmt.Errorf("OTP_EXPIRED")
	}

	// Increment attempts
	var attempts int
	err = s.pool.QueryRow(ctx, `
		UPDATE registration_flows SET otp_attempts = otp_attempts + 1, updated_at_utc = now()
		WHERE id = $1 RETURNING otp_attempts
	`, flowID).Scan(&attempts)
	if err != nil {
		return nil, fmt.Errorf("increment attempts: %w", err)
	}

	if HashOtp(otp) != flow.OtpHash {
		if attempts >= OtpMaxAttempts {
			s.pool.Exec(ctx, `
				UPDATE registration_flows SET status = $2, otp_blocked_until_utc = $3, updated_at_utc = now()
				WHERE id = $1
			`, flowID, StatusOtpAttemptsExceeded, now.Add(OtpCooldownMinutes*time.Minute))
			return nil, fmt.Errorf("OTP_ATTEMPTS_EXCEEDED")
		}
		return nil, fmt.Errorf("OTP_INVALID")
	}

	_, err = s.pool.Exec(ctx, `
		UPDATE registration_flows SET status = $2, verified_at_utc = $3, updated_at_utc = now()
		WHERE id = $1
	`, flowID, StatusPendingProfile, now)
	if err != nil {
		return nil, fmt.Errorf("update flow: %w", err)
	}

	return &VerifyEmailResponse{FlowID: flowID, Status: StatusPendingProfile}, nil
}

type CompleteProfileRequest struct {
	FlowID           uuid.UUID `json:"flow_id"`
	FirstName        string    `json:"first_name"`
	LastName         string    `json:"last_name"`
	IdentityDocument string    `json:"identity_document"`
	TaxID            string    `json:"tax_id"`
	WhatsAppPhone    string    `json:"whatsapp_phone"`
	FullAddress      string    `json:"full_address"`
	Password         string    `json:"password"`
}

type CompleteProfileResponse struct {
	UserID      uuid.UUID `json:"user_id"`
	Status      string    `json:"status"`
	AccountType string    `json:"account_type"`
}

type CheckDocumentAvailabilityResponse struct {
	Available bool   `json:"available"`
	Code      string `json:"code,omitempty"`
	Message   string `json:"message,omitempty"`
}

func (s *Service) CheckDocumentAvailability(ctx context.Context, identityDocument string) (*CheckDocumentAvailabilityResponse, error) {
	linked, err := s.isDocumentLinkedToUser(ctx, identityDocument)
	if err != nil {
		return nil, err
	}

	if linked {
		return &CheckDocumentAvailabilityResponse{
			Available: false,
			Code:      "DOCUMENT_ALREADY_LINKED_TO_USER",
			Message:   "El documento que está intentando colocar se encuentra registrado a otro usuario.",
		}, nil
	}

	return &CheckDocumentAvailabilityResponse{Available: true}, nil
}

func (s *Service) CompleteProfile(ctx context.Context, req CompleteProfileRequest) (*CompleteProfileResponse, error) {
	var flow struct {
		ID            uuid.UUID
		Email         string
		Status        string
		VerifiedAtUtc *time.Time
	}

	err := s.pool.QueryRow(ctx, `
		SELECT id, email, status, verified_at_utc FROM registration_flows WHERE id = $1
	`, req.FlowID).Scan(&flow.ID, &flow.Email, &flow.Status, &flow.VerifiedAtUtc)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("FLOW_NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get flow: %w", err)
	}

	if flow.Status != StatusPendingProfile {
		return nil, fmt.Errorf("FLOW_INVALID_STATUS")
	}

	normalizedEmail := normalizeEmail(flow.Email)

	var exists bool
	err = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`, normalizedEmail).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("check user: %w", err)
	}
	if exists {
		return nil, fmt.Errorf("EMAIL_ALREADY_REGISTERED")
	}

	pwHash, err := HashPassword(req.Password)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	userID := uuid.New()
	profileID := uuid.New()

	userName := req.FirstName
	if req.LastName != "" {
		userName = req.FirstName + " " + req.LastName
	}
	identityDocument := strings.ToUpper(strings.TrimSpace(req.IdentityDocument))

	var personID uuid.UUID
	var personExists bool
	err = tx.QueryRow(ctx, `
		SELECT id
		FROM persons
		WHERE identity_document = $1
	`, identityDocument).Scan(&personID)
	if err != nil && err != pgx.ErrNoRows {
		return nil, fmt.Errorf("get person by document: %w", err)
	}
	personExists = err == nil

	if personExists {
		var ownerID uuid.UUID
		err = tx.QueryRow(ctx, `
			SELECT id
			FROM users
			WHERE person_id = $1
		`, personID).Scan(&ownerID)
		if err != nil && err != pgx.ErrNoRows {
			return nil, fmt.Errorf("check person owner: %w", err)
		}
		if err == nil {
			return nil, fmt.Errorf("DOCUMENT_ALREADY_LINKED_TO_USER")
		}

		_, err = tx.Exec(ctx, `
			UPDATE persons
			SET name = $2,
				identity_document = $3,
				tax_id = NULLIF($4, ''),
				whatsapp_phone = $5,
				full_address = $6,
				is_client = true,
				updated_at_utc = now()
			WHERE id = $1
		`, personID, userName, identityDocument, nullString(req.TaxID), req.WhatsAppPhone, req.FullAddress)
		if err != nil {
			return nil, fmt.Errorf("update person: %w", err)
		}
	} else {
		personID = uuid.New()
		_, err = tx.Exec(ctx, `
			INSERT INTO persons (id, name, identity_document, tax_id, whatsapp_phone, full_address, is_client, is_staff, created_at_utc, updated_at_utc)
			VALUES ($1, $2, $3, $4, $5, $6, true, false, now(), now())
		`, personID, userName, identityDocument, nullString(req.TaxID), req.WhatsAppPhone, req.FullAddress)
		if err != nil {
			return nil, fmt.Errorf("create person: %w", err)
		}
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO profiles (id, name, code, created_at_utc, updated_at_utc)
		VALUES ($1, $2, $3, now(), now())
	`, profileID, userName, identityDocument)
	if err != nil {
		return nil, fmt.Errorf("create profile: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO users (
			id, email, password_hash, onboarding_status, email_verified_at_utc, status,
			profile_id, person_id, created_at_utc
		)
		VALUES ($1, $2, $3, 'active', $4, 'Active', $5, $6, now())
	`, userID, normalizedEmail, pwHash, flow.VerifiedAtUtc, profileID, personID)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	var clientRoleID uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id FROM roles WHERE code = 'client'`).Scan(&clientRoleID)
	if err != nil {
		return nil, fmt.Errorf("get client role: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO profile_role_assignments (id, profile_id, role_id, active, created_at_utc)
		VALUES ($1, $2, $3, true, now())
	`, uuid.New(), profileID, clientRoleID)
	if err != nil {
		return nil, fmt.Errorf("assign role: %w", err)
	}

	_, err = tx.Exec(ctx, `
		UPDATE registration_flows SET status = $2, updated_at_utc = now() WHERE id = $1
	`, req.FlowID, StatusActive)
	if err != nil {
		return nil, fmt.Errorf("update flow: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return &CompleteProfileResponse{UserID: userID, Status: "active", AccountType: "client"}, nil
}

func (s *Service) isDocumentLinkedToUser(ctx context.Context, identityDocument string) (bool, error) {
	var linked bool
	if err := s.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM users u
			JOIN persons p ON p.id = u.person_id
			WHERE p.identity_document = $1
		)
	`, strings.ToUpper(strings.TrimSpace(identityDocument))).Scan(&linked); err != nil {
		return false, fmt.Errorf("check document owner: %w", err)
	}

	return linked, nil
}

// Login

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

func (s *Service) Login(ctx context.Context, req LoginRequest) (*LoginResponse, error) {
	normalizedEmail := normalizeEmail(req.Email)

	var user struct {
		ID           uuid.UUID
		Email        string
		PasswordHash string
		Status       string
	}

	err := s.pool.QueryRow(ctx, `
		SELECT id, email, password_hash, status FROM users WHERE email = $1
	`, normalizedEmail).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.Status)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("INVALID_CREDENTIALS")
	}
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	if user.Status != "Active" {
		return nil, fmt.Errorf("ACCOUNT_INACTIVE")
	}

	if !VerifyPassword(req.Password, user.PasswordHash) {
		return nil, fmt.Errorf("INVALID_CREDENTIALS")
	}

	// Get profile ID + branch ID
	var profileID uuid.UUID
	var branchID *uuid.UUID
	err = s.pool.QueryRow(ctx, `SELECT profile_id, branch_id FROM users WHERE id = $1`, user.ID).Scan(&profileID, &branchID)
	if err != nil {
		return nil, fmt.Errorf("get profile: %w", err)
	}

	// Generate access token
	accessToken, err := GenerateAccessToken(
		s.keySvc.Key(),
		s.tokenCfg,
		user.ID,
		profileID,
		branchID,
		"lcdpc-web",
		"openid email profile",
		user.Email,
	)
	if err != nil {
		return nil, fmt.Errorf("generate access token: %w", err)
	}

	// Generate refresh token
	refreshToken, err := GenerateOpaqueToken()
	if err != nil {
		return nil, fmt.Errorf("generate refresh token: %w", err)
	}

	refreshTokenHash := HashToken(refreshToken)
	accessTokenHash := HashToken(accessToken)
	now := time.Now().UTC()

	// Create legacy session
	_, err = s.pool.Exec(ctx, `
		INSERT INTO user_sessions (id, user_id, access_token_hash, refresh_token_hash, access_token_expires_at_utc, refresh_token_expires_at_utc, created_at_utc)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, uuid.New(), user.ID, accessTokenHash, refreshTokenHash,
		now.Add(time.Duration(s.tokenCfg.AccessTokenTTLMin)*time.Minute),
		now.Add(30*24*time.Hour), now)
	if err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}

	// Create OAuth2 refresh token
	_, err = s.pool.Exec(ctx, `
		INSERT INTO oauth2_refresh_tokens (token_hash, client_id, user_id, scope, family_id, expires_at_utc, created_at_utc)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, refreshTokenHash, "lcdpc-web", user.ID, "openid email profile",
		uuid.New(), now.Add(30*24*time.Hour), now)
	if err != nil {
		return nil, fmt.Errorf("create refresh token: %w", err)
	}

	return &LoginResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    s.tokenCfg.AccessTokenTTLMin * 60,
	}, nil
}

// Me

type MeResponse struct {
	Authenticated bool         `json:"authenticated"`
	User          *UserSummary `json:"user,omitempty"`
	Permissions   []string     `json:"permissions"`
	ExpiresIn     *int         `json:"expires_in,omitempty"`
}

type UserSummary struct {
	ID               uuid.UUID  `json:"id"`
	Email            string     `json:"email"`
	DisplayName      string     `json:"display_name"`
	Status           string     `json:"status"`
	AccountType      string     `json:"account_type"`
	OnboardingStatus string     `json:"onboarding_status"`
	EmailVerifiedAt  *time.Time `json:"email_verified_at"`
	ProfileID        string     `json:"profile_id"`
	BranchID         *string    `json:"branch_id,omitempty"`
}

func (s *Service) Me(ctx context.Context, accessToken string) (*MeResponse, error) {
	if accessToken == "" {
		return &MeResponse{Authenticated: false, Permissions: []string{}}, nil
	}

	accessTokenHash := HashToken(accessToken)

	var session struct {
		UserID                  uuid.UUID
		AccessTokenExpiresAtUtc time.Time
	}

	err := s.pool.QueryRow(ctx, `
		SELECT user_id, access_token_expires_at_utc FROM user_sessions
		WHERE access_token_hash = $1 AND revoked_at_utc IS NULL AND access_token_expires_at_utc > now()
	`, accessTokenHash).Scan(&session.UserID, &session.AccessTokenExpiresAtUtc)
	if err == pgx.ErrNoRows {
		return &MeResponse{Authenticated: false, Permissions: []string{}}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get session: %w", err)
	}

	// Get user + profile
	var user struct {
		ID               uuid.UUID
		Email            string
		Status           string
		OnboardingStatus string
		EmailVerifiedAt  *time.Time
		Name             string
		PersonIsClient   *bool
		PersonIsStaff    *bool
		ProfileID        uuid.UUID
		BranchID         *uuid.UUID
	}

	err = s.pool.QueryRow(ctx, `
		SELECT u.id, u.email, u.status, u.onboarding_status, u.email_verified_at_utc,
		       COALESCE(per.name, ''), per.is_client, COALESCE(per.is_staff, false), u.profile_id, u.branch_id
		FROM users u
		LEFT JOIN persons per ON per.id = u.person_id
		WHERE u.id = $1
	`, session.UserID).Scan(&user.ID, &user.Email, &user.Status, &user.OnboardingStatus,
		&user.EmailVerifiedAt, &user.Name, &user.PersonIsClient, &user.PersonIsStaff, &user.ProfileID, &user.BranchID)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	displayName := user.Email
	if user.Name != "" {
		displayName = user.Name
	}

	userStatus := "active"
	switch user.Status {
	case "Suspended":
		userStatus = "suspended"
	case "Deactivated":
		userStatus = "deactivated"
	}

	// Get permissions from store
	permissions := s.rbacStore.GetPermissions(user.ProfileID)
	if permissions == nil {
		permissions = []string{}
	}

	accountType := "client"
	if user.PersonIsStaff != nil && *user.PersonIsStaff {
		accountType = "administrator"
	} else if user.PersonIsClient != nil {
		if !*user.PersonIsClient {
			accountType = "administrator"
		}
	} else {
		for _, code := range permissions {
			if code == "rbac:resource:create" || code == "rbac:role:create" {
				accountType = "administrator"
				break
			}
		}
	}

	expiresIn := int(time.Until(session.AccessTokenExpiresAtUtc).Seconds())
	if expiresIn < 0 {
		expiresIn = 0
	}

	var branchIDStr *string
	if user.BranchID != nil {
		s := user.BranchID.String()
		branchIDStr = &s
	}

	return &MeResponse{
		Authenticated: true,
		User: &UserSummary{
			ID:               user.ID,
			Email:            user.Email,
			DisplayName:      displayName,
			Status:           userStatus,
			AccountType:      accountType,
			OnboardingStatus: user.OnboardingStatus,
			EmailVerifiedAt:  user.EmailVerifiedAt,
			ProfileID:        user.ProfileID.String(),
			BranchID:         branchIDStr,
		},
		Permissions: permissions,
		ExpiresIn:   &expiresIn,
	}, nil
}

// Refresh

func (s *Service) Refresh(ctx context.Context, refreshToken string) (*LoginResponse, error) {
	if refreshToken == "" {
		return nil, fmt.Errorf("INVALID_REFRESH_TOKEN")
	}

	refreshTokenHash := HashToken(refreshToken)

	var rt struct {
		TokenHash string
		ClientID  string
		UserID    uuid.UUID
		Scope     string
		FamilyID  uuid.UUID
		ExpiresAt time.Time
	}

	err := s.pool.QueryRow(ctx, `
		SELECT token_hash, client_id, user_id, scope, family_id, expires_at_utc
		FROM oauth2_refresh_tokens
		WHERE token_hash = $1 AND revoked_at_utc IS NULL AND expires_at_utc > now()
	`, refreshTokenHash).Scan(&rt.TokenHash, &rt.ClientID, &rt.UserID, &rt.Scope, &rt.FamilyID, &rt.ExpiresAt)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("INVALID_REFRESH_TOKEN")
	}
	if err != nil {
		return nil, fmt.Errorf("get refresh token: %w", err)
	}

	// Revoke old token
	_, err = s.pool.Exec(ctx, `UPDATE oauth2_refresh_tokens SET revoked_at_utc = now() WHERE token_hash = $1`, rt.TokenHash)
	if err != nil {
		return nil, fmt.Errorf("revoke old token: %w", err)
	}

	// Generate new tokens
	var profileID uuid.UUID
	var email string
	var branchID *uuid.UUID
	err = s.pool.QueryRow(ctx, `SELECT profile_id, email, branch_id FROM users WHERE id = $1`, rt.UserID).Scan(&profileID, &email, &branchID)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	accessToken, err := GenerateAccessToken(s.keySvc.Key(), s.tokenCfg, rt.UserID, profileID, branchID, rt.ClientID, rt.Scope, email)
	if err != nil {
		return nil, fmt.Errorf("generate access token: %w", err)
	}

	newRefreshToken, err := GenerateOpaqueToken()
	if err != nil {
		return nil, fmt.Errorf("generate refresh token: %w", err)
	}

	newRefreshTokenHash := HashToken(newRefreshToken)
	now := time.Now().UTC()

	_, err = s.pool.Exec(ctx, `
		INSERT INTO oauth2_refresh_tokens (token_hash, client_id, user_id, scope, family_id, previous_token_hash, expires_at_utc, created_at_utc)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, newRefreshTokenHash, rt.ClientID, rt.UserID, rt.Scope, rt.FamilyID, rt.TokenHash, now.Add(30*24*time.Hour), now)
	if err != nil {
		return nil, fmt.Errorf("create new refresh token: %w", err)
	}

	// Create legacy session
	accessTokenHash := HashToken(accessToken)
	_, err = s.pool.Exec(ctx, `
		INSERT INTO user_sessions (id, user_id, access_token_hash, refresh_token_hash, access_token_expires_at_utc, refresh_token_expires_at_utc, created_at_utc)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, uuid.New(), rt.UserID, accessTokenHash, newRefreshTokenHash,
		now.Add(time.Duration(s.tokenCfg.AccessTokenTTLMin)*time.Minute),
		now.Add(30*24*time.Hour), now)
	if err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}

	return &LoginResponse{
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
		ExpiresIn:    s.tokenCfg.AccessTokenTTLMin * 60,
	}, nil
}

// Logout

func (s *Service) Logout(ctx context.Context, accessToken string) error {
	if accessToken == "" {
		return nil
	}

	accessTokenHash := HashToken(accessToken)

	_, err := s.pool.Exec(ctx, `
		UPDATE user_sessions SET revoked_at_utc = now() WHERE access_token_hash = $1 AND revoked_at_utc IS NULL
	`, accessTokenHash)
	if err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}

	return nil
}

// Forgot Password

type ForgotPasswordResponse struct {
	Status    string    `json:"status"`
	Message   string    `json:"message"`
	OtpPolicy OtpPolicy `json:"otp_policy"`
}

func (s *Service) ForgotPassword(ctx context.Context, email, ipAddress string) (*ForgotPasswordResponse, error) {
	normalizedEmail := normalizeEmail(email)

	var user struct {
		ID    uuid.UUID
		Email string
	}

	err := s.pool.QueryRow(ctx, `SELECT id, email FROM users WHERE email = $1`, normalizedEmail).Scan(&user.ID, &user.Email)
	if err == pgx.ErrNoRows {
		s.createAuditLog(ctx, nil, "auth.password.forgot_requested_unknown_email", ipAddress, nil)
		return &ForgotPasswordResponse{Status: "accepted", Message: "Si la cuenta existe, se envió un código de recuperación.", OtpPolicy: OtpPolicy{TTLMinutes: OtpTTLMinutes, MaxAttempts: OtpMaxAttempts, CooldownMin: OtpCooldownMinutes}}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	now := time.Now().UTC()
	ttl := time.Duration(OtpTTLMinutes) * time.Minute

	var activeReset struct {
		ID                 uuid.UUID
		OtpBlockedUntilUtc *time.Time
	}
	err = s.pool.QueryRow(ctx, `
		SELECT id, otp_blocked_until_utc
		FROM password_reset_tokens
		WHERE user_id = $1 AND used_at_utc IS NULL AND revoked_at_utc IS NULL
		ORDER BY created_at_utc DESC
		LIMIT 1
	`, user.ID).Scan(&activeReset.ID, &activeReset.OtpBlockedUntilUtc)
	if err != nil && err != pgx.ErrNoRows {
		return nil, fmt.Errorf("get reset token: %w", err)
	}
	if err == nil && activeReset.OtpBlockedUntilUtc != nil && activeReset.OtpBlockedUntilUtc.After(now) {
		return nil, fmt.Errorf("OTP_COOLDOWN_ACTIVE")
	}

	otpCode := GenerateOtp()

	if err == pgx.ErrNoRows {
		_, err = s.pool.Exec(ctx, `
			INSERT INTO password_reset_tokens (id, user_id, otp_code, otp_expires_at_utc, otp_attempts, otp_blocked_until_utc, created_at_utc, updated_at_utc)
			VALUES ($1, $2, $3, $4, 0, NULL, $5, $5)
		`, uuid.New(), user.ID, otpCode, now.Add(ttl), now)
	} else {
		_, err = s.pool.Exec(ctx, `
			UPDATE password_reset_tokens
			SET otp_code = $2, otp_expires_at_utc = $3, otp_attempts = 0, otp_blocked_until_utc = NULL, used_at_utc = NULL, revoked_at_utc = NULL, updated_at_utc = now()
			WHERE id = $1
		`, activeReset.ID, otpCode, now.Add(ttl))
	}
	if err != nil {
		return nil, fmt.Errorf("save reset otp: %w", err)
	}

	s.createAuditLog(ctx, &user.ID, "auth.password.forgot_requested", ipAddress, nil)

	if err := s.emailSvc.SendPasswordResetAsync(ctx, normalizedEmail, otpCode, OtpTTLMinutes); err != nil {
		slog.Error("failed to send password reset email", "error", err)
	}

	return &ForgotPasswordResponse{Status: "accepted", Message: "Si la cuenta existe, se envió un código de recuperación.", OtpPolicy: OtpPolicy{TTLMinutes: OtpTTLMinutes, MaxAttempts: OtpMaxAttempts, CooldownMin: OtpCooldownMinutes}}, nil
}

// Reset Password

type ResetPasswordResponse struct {
	Status          string `json:"status"`
	SessionsRevoked bool   `json:"sessions_revoked"`
}

func (s *Service) ResetPassword(ctx context.Context, email, otp, newPassword, ipAddress string) (*ResetPasswordResponse, error) {
	if email == "" || otp == "" {
		return nil, fmt.Errorf("OTP_INVALID")
	}

	normalizedEmail := normalizeEmail(email)
	now := time.Now().UTC()

	var user struct {
		ID    uuid.UUID
		Email string
	}

	err := s.pool.QueryRow(ctx, `SELECT id, email FROM users WHERE email = $1`, normalizedEmail).Scan(&user.ID, &user.Email)
	if err == pgx.ErrNoRows {
		s.createAuditLog(ctx, nil, "auth.password.reset_invalid_token", ipAddress, nil)
		return nil, fmt.Errorf("OTP_EXPIRED")
	}
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	var resetToken struct {
		ID                 uuid.UUID
		UserID             uuid.UUID
		OtpCode            string
		OtpExpiresAtUtc    time.Time
		OtpAttempts        int
		OtpBlockedUntilUtc *time.Time
	}

	err = s.pool.QueryRow(ctx, `
		SELECT id, user_id, otp_code, otp_expires_at_utc, otp_attempts, otp_blocked_until_utc
		FROM password_reset_tokens
		WHERE user_id = $1 AND used_at_utc IS NULL AND revoked_at_utc IS NULL
		ORDER BY created_at_utc DESC
		LIMIT 1
	`, user.ID).Scan(&resetToken.ID, &resetToken.UserID, &resetToken.OtpCode, &resetToken.OtpExpiresAtUtc, &resetToken.OtpAttempts, &resetToken.OtpBlockedUntilUtc)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("OTP_EXPIRED")
	}
	if err != nil {
		return nil, fmt.Errorf("get reset token: %w", err)
	}

	if resetToken.OtpBlockedUntilUtc != nil && resetToken.OtpBlockedUntilUtc.After(now) {
		return nil, fmt.Errorf("OTP_COOLDOWN_ACTIVE")
	}
	if resetToken.OtpExpiresAtUtc.Before(now) {
		return nil, fmt.Errorf("OTP_EXPIRED")
	}
	if strings.TrimSpace(otp) != resetToken.OtpCode {
		var attempts int
		err = s.pool.QueryRow(ctx, `
			UPDATE password_reset_tokens SET otp_attempts = otp_attempts + 1, updated_at_utc = now()
			WHERE id = $1 RETURNING otp_attempts
		`, resetToken.ID).Scan(&attempts)
		if err != nil {
			return nil, fmt.Errorf("increment reset attempts: %w", err)
		}
		if attempts >= OtpMaxAttempts {
			_, _ = s.pool.Exec(ctx, `UPDATE password_reset_tokens SET otp_blocked_until_utc = $2, updated_at_utc = now() WHERE id = $1`, resetToken.ID, now.Add(OtpCooldownMinutes*time.Minute))
			return nil, fmt.Errorf("OTP_ATTEMPTS_EXCEEDED")
		}
		return nil, fmt.Errorf("OTP_INVALID")
	}

	var policy struct {
		TTLMinutes     int
		RevokeSessions bool
	}
	err = s.pool.QueryRow(ctx, `
		SELECT password_reset_ttl_minutes, revoke_sessions_on_password_reset FROM auth_security_policies LIMIT 1
	`).Scan(&policy.TTLMinutes, &policy.RevokeSessions)
	if err != nil {
		policy.TTLMinutes = 30
		policy.RevokeSessions = true
	}

	pwHash, err := HashPassword(newPassword)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `UPDATE users SET password_hash = $2 WHERE id = $1`, resetToken.UserID, pwHash)
	if err != nil {
		return nil, fmt.Errorf("update password: %w", err)
	}

	_, err = tx.Exec(ctx, `UPDATE password_reset_tokens SET otp_code = NULL, used_at_utc = now(), revoked_at_utc = now(), updated_at_utc = now() WHERE id = $1`, resetToken.ID)
	if err != nil {
		return nil, fmt.Errorf("use token: %w", err)
	}

	sessionsRevoked := false
	if policy.RevokeSessions {
		tag, _ := tx.Exec(ctx, `UPDATE user_sessions SET revoked_at_utc = now() WHERE user_id = $1 AND revoked_at_utc IS NULL`, resetToken.UserID)
		sessionsRevoked = tag.RowsAffected() > 0
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	s.createAuditLog(ctx, &resetToken.UserID, "auth.password.reset_completed", ipAddress, nil)

	return &ResetPasswordResponse{Status: "completed", SessionsRevoked: sessionsRevoked}, nil
}

// Security Policy

type SecurityPolicyResponse struct {
	PasswordResetTTLMinutes       int  `json:"password_reset_ttl_minutes"`
	RevokeSessionsOnPasswordReset bool `json:"revoke_sessions_on_password_reset"`
}

func (s *Service) GetSecurityPolicy(ctx context.Context) (*SecurityPolicyResponse, error) {
	var policy SecurityPolicyResponse
	err := s.pool.QueryRow(ctx, `
		SELECT password_reset_ttl_minutes, revoke_sessions_on_password_reset FROM auth_security_policies LIMIT 1
	`).Scan(&policy.PasswordResetTTLMinutes, &policy.RevokeSessionsOnPasswordReset)
	if err != nil {
		return &SecurityPolicyResponse{PasswordResetTTLMinutes: 30, RevokeSessionsOnPasswordReset: true}, nil
	}
	return &policy, nil
}

func (s *Service) UpdateSecurityPolicy(ctx context.Context, ttlMinutes int, revokeSessions bool) (*SecurityPolicyResponse, error) {
	if ttlMinutes < 5 || ttlMinutes > 1440 {
		return nil, fmt.Errorf("INVALID_RESET_TTL")
	}

	_, err := s.pool.Exec(ctx, `
		UPDATE auth_security_policies SET password_reset_ttl_minutes = $1, revoke_sessions_on_password_reset = $2, updated_at_utc = now()
	`, ttlMinutes, revokeSessions)
	if err != nil {
		return nil, fmt.Errorf("update policy: %w", err)
	}

	s.createAuditLog(ctx, nil, "auth.security.policy_updated", "", nil)

	return &SecurityPolicyResponse{PasswordResetTTLMinutes: ttlMinutes, RevokeSessionsOnPasswordReset: revokeSessions}, nil
}

// Helpers

func (s *Service) resetOTP(ctx context.Context, flowID uuid.UUID, now time.Time) {
	otpCode := GenerateOtp()
	otpHash := HashOtp(otpCode)
	s.pool.Exec(ctx, `
		UPDATE registration_flows SET status = $2, otp_code = $3, otp_hash = $4, otp_expires_at_utc = $5, otp_attempts = 0, otp_blocked_until_utc = NULL, verified_at_utc = NULL, updated_at_utc = now()
		WHERE id = $1
	`, flowID, StatusPendingEmailVerification, otpCode, otpHash, now.Add(OtpTTLMinutes*time.Minute))
}

func (s *Service) createAuditLog(ctx context.Context, userID *uuid.UUID, actionCode, ipAddress string, metadata interface{}) {
	s.pool.Exec(ctx, `
		INSERT INTO audit_logs (id, user_id, action_code, area, metadata_json, ip_address, created_at_utc)
		VALUES ($1, $2, $3, 'auth', $4, $5, now())
	`, uuid.New(), userID, actionCode, nil, ipAddress)
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func nullString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
