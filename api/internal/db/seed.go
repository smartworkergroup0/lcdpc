package db

import (
	"context"
	crand "crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lcdpc/lcdpc-go/internal/auth"
)

type SeedConfig struct {
	SuperUserPassword         string
	SuperUserAlias            string
	SuperUserEmail            string
	SuperUserFirstName        string
	SuperUserLastName         string
	SuperUserIdentityDocument string
	SuperUserWhatsAppPhone    string
	SuperUserFullAddress      string
}

func Seed(ctx context.Context, pool *pgxpool.Pool, cfg SeedConfig) error {
	if err := seedSuperUser(ctx, pool, cfg); err != nil {
		return fmt.Errorf("seed super user: %w", err)
	}
	if err := seedOAuth2Client(ctx, pool); err != nil {
		return fmt.Errorf("seed oauth2 client: %w", err)
	}
	if err := seedAPIToken(ctx, pool); err != nil {
		return fmt.Errorf("seed api token: %w", err)
	}
	return nil
}

func seedSuperUser(ctx context.Context, pool *pgxpool.Pool, cfg SeedConfig) error {
	email := cfg.SuperUserEmail
	if email == "" {
		email = "admin@lcdpc.local"
	}

	var exists bool
	err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`, email).Scan(&exists)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}

	err = pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM profiles WHERE code = $1)`, cfg.SuperUserIdentityDocument).Scan(&exists)
	if err != nil {
		return err
	}
	if exists {
		slog.Warn("superuser seed skipped: profile code already exists", "email", email, "code", cfg.SuperUserIdentityDocument)
		return nil
	}

	pwHash, err := auth.HashPassword(cfg.SuperUserPassword)
	if err != nil {
		return fmt.Errorf("hash superuser password: %w", err)
	}

	userID := uuid.New()
	profileID := uuid.New()
	personID := uuid.New()

	profileName := cfg.SuperUserFirstName
	if cfg.SuperUserLastName != "" {
		profileName = cfg.SuperUserFirstName + " " + cfg.SuperUserLastName
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO profiles (id, name, code, created_at_utc, updated_at_utc)
		VALUES ($1, $2, $3, now(), now())
	`, profileID, profileName, cfg.SuperUserIdentityDocument)
	if err != nil {
		return err
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO persons (id, name, identity_document, tax_id, whatsapp_phone, full_address, is_client, is_staff, created_at_utc, updated_at_utc)
		VALUES ($1, $2, $3, NULL, $4, $5, false, true, now(), now())
	`, personID, profileName, cfg.SuperUserIdentityDocument, cfg.SuperUserWhatsAppPhone, cfg.SuperUserFullAddress)
	if err != nil {
		return err
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO users (
			id, email, password_hash, onboarding_status, status, profile_id, person_id, created_at_utc
		)
		VALUES ($1, $2, $3, 'active', 'Active', $4, $5, now())
	`, userID, email, pwHash, profileID, personID)
	if err != nil {
		return err
	}

	var adminRoleID uuid.UUID
	err = pool.QueryRow(ctx, `SELECT id FROM roles WHERE code = 'global_admin'`).Scan(&adminRoleID)
	if err != nil {
		return err
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO profile_role_assignments (id, profile_id, role_id, active, created_at_utc)
		VALUES ($1, $2, $3, true, now())
	`, uuid.New(), profileID, adminRoleID)
	if err != nil {
		return err
	}

	slog.Info("superuser seeded", "email", email)
	return nil
}

func seedOAuth2Client(ctx context.Context, pool *pgxpool.Pool) error {
	var exists bool
	err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM oauth2_clients WHERE client_id = 'lcdpc-web')`).Scan(&exists)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}

	redirectURIs := `["http://localhost:4200","http://localhost:4200/auth/callback"]`
	grantTypes := `["authorization_code","refresh_token"]`

	_, err = pool.Exec(ctx, `
		INSERT INTO oauth2_clients (client_id, client_name, redirect_uris, grant_types, require_pkce, allowed_scopes, created_at_utc)
		VALUES ('lcdpc-web', 'LCDPC Web SPA', $1, $2, true, 'openid email profile admin admin:branches admin:users', now())
	`, redirectURIs, grantTypes)
	if err != nil {
		return err
	}

	slog.Info("oauth2 client seeded", "client_id", "lcdpc-web")
	return nil
}

func seedAPIToken(ctx context.Context, pool *pgxpool.Pool) error {
	var exists bool
	err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM api_tokens LIMIT 1)`).Scan(&exists)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}

	tokenBytes := make([]byte, 32)
	if _, err := crand.Read(tokenBytes); err != nil {
		return err
	}
	token := hex.EncodeToString(tokenBytes)
	tokenHash := sha256Hex(token)

	_, err = pool.Exec(ctx, `
		INSERT INTO api_tokens (id, name, token_hash, is_active, created_at_utc)
		VALUES ($1, 'Initial Sync Token', $2, true, now())
	`, uuid.New(), tokenHash)
	if err != nil {
		return err
	}

	slog.Info("═══════════════════════════════════════════════════════════")
	slog.Info("INITIAL SYNC API TOKEN (save it, it will not be shown again):")
	slog.Info(token)
	slog.Info("═══════════════════════════════════════════════════════════")

	return nil
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}
