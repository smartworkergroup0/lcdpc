package configs

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port        string
	DatabaseURL string
	FrontendURL string

	// Auth
	PasswordResetTTLMinutes       int
	RevokeSessionsOnPasswordReset bool
	SuperUserPassword             string
	SuperUserAlias                string
	SuperUserEmail                string
	SuperUserFirstName            string
	SuperUserLastName             string
	SuperUserIdentityDocument     string
	SuperUserWhatsAppPhone        string
	SuperUserFullAddress          string

	// Google OAuth
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURI  string
	GoogleScope        string

	// OAuth2
	OAuth2Issuer               string
	OAuth2Audience             string
	OAuth2AccessTokenTTLMin    int
	OAuth2RefreshTokenTTLDays  int
	OAuth2AuthCodeTTLMinutes   int
	PasetoKeyPath              string
	PasetoDecryptionKey        string

	// Service Account PASETO
	PasetoSAKeyPath       string
	PasetoSADecryptionKey string

	// Email
	EmailDriver  string
	ResendAPIKey string
	ResendFrom   string

	// SMTP
	SMTPHost     string
	SMTPPort     int
	SMTPUsername string
	SMTPPassword string
	SMTPFrom     string

	// CORS
	CORSAllowedOrigins []string

	// Catalog
	CatalogDomain string

	// External Assistant API (SmartWorker)
	SmartWorkerAPIURL  string
	SmartWorkerUser    string
	SmartWorkerPass    string
}

func Load() *Config {
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbUser := getEnv("DB_USER", "postgres")
	dbPassword := getEnv("DB_PASSWORD", "123456")
	dbName := getEnv("DB_NAME", "tuinvoice")
	dbSSL := getEnv("DB_SSL", "disable")

	databaseURL := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
		dbUser, dbPassword, dbHost, dbPort, dbName, dbSSL)

	return &Config{
		Port:        getEnv("PORT", "8080"),
		DatabaseURL: databaseURL,
		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:4200"),

		PasswordResetTTLMinutes:       getEnvInt("AUTH_PASSWORD_RESET_TTL_MINUTES", 30),
		RevokeSessionsOnPasswordReset: getEnvBool("AUTH_REVOKE_SESSIONS_ON_PASSWORD_RESET", true),
		SuperUserPassword:             getEnv("AUTH_SUPERUSER_PASSWORD", "SuperPerro123!"),
		SuperUserAlias:                getEnv("AUTH_SUPERUSER_ALIAS", "initial_admin"),
		SuperUserEmail:                getEnv("AUTH_SUPERUSER_EMAIL", "admin@lcdpc.local"),
		SuperUserFirstName:            getEnv("AUTH_SUPERUSER_FIRST_NAME", "Admin"),
		SuperUserLastName:             getEnv("AUTH_SUPERUSER_LAST_NAME", "Initial"),
		SuperUserIdentityDocument:     getEnv("AUTH_SUPERUSER_IDENTITY_DOCUMENT", "V00000001"),
		SuperUserWhatsAppPhone:        getEnv("AUTH_SUPERUSER_WHATSAPP_PHONE", "0000000000"),
		SuperUserFullAddress:          getEnv("AUTH_SUPERUSER_FULL_ADDRESS", "Initial administrator user"),

		GoogleClientID:     getEnv("AUTH_GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("AUTH_GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirectURI:  getEnv("AUTH_GOOGLE_REDIRECT_URI", "http://localhost:8080/api/v1/auth/register/google/callback"),
		GoogleScope:        getEnv("AUTH_GOOGLE_SCOPE", "openid email profile"),

		OAuth2Issuer:              getEnv("OAUTH2_ISSUER", "http://localhost:8080"),
		OAuth2Audience:            getEnv("OAUTH2_AUDIENCE", "lcdpc-api"),
		OAuth2AccessTokenTTLMin:   getEnvInt("OAUTH2_ACCESS_TOKEN_TTL_MINUTES", 60),
		OAuth2RefreshTokenTTLDays: getEnvInt("OAUTH2_REFRESH_TOKEN_TTL_DAYS", 30),
		OAuth2AuthCodeTTLMinutes:  getEnvInt("OAUTH2_AUTHORIZATION_CODE_TTL_MINUTES", 10),
		PasetoKeyPath:             getEnv("PASETO_KEY_PATH", ""),
		PasetoDecryptionKey:       getEnv("PASETO_DECRYPTION_KEY", ""),
		PasetoSAKeyPath:           getEnv("PASETO_SA_KEY_PATH", "paseto_sa.key"),
		PasetoSADecryptionKey:     getEnv("PASETO_SA_DECRYPTION_KEY", ""),

		EmailDriver:  getEnv("EMAIL_DRIVER", "resend"),
		ResendAPIKey: getEnv("RESEND_APITOKEN", ""),
		ResendFrom:   getEnv("RESEND_FROM_ADDRESS", "LCDPC <onboarding@resend.dev>"),

		SMTPHost:     getEnv("SMTP_HOST", "localhost"),
		SMTPPort:     getEnvInt("SMTP_PORT", 1025),
		SMTPUsername: getEnv("SMTP_USERNAME", ""),
		SMTPPassword: getEnv("SMTP_PASSWORD", ""),
		SMTPFrom:     getEnv("SMTP_FROM_ADDRESS", "noreply@lcdpc.local"),

		CORSAllowedOrigins: getEnvSlice("CORS_ALLOWED_ORIGINS", []string{
			"http://localhost:4200",
			"http://localhost:3000",
			"http://localhost:5173",
		}),

		CatalogDomain: getEnv("CATALOG_DOMAIN", "https://tormesca.com"),

		SmartWorkerAPIURL: getEnv("SMARTWORKER_API_URL", "https://api.smartworker.work/api"),
		SmartWorkerUser:   getEnv("SMARTWORKER_USERNAME", ""),
		SmartWorkerPass:   getEnv("SMARTWORKER_PASSWORD", ""),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

func getEnvSlice(key string, fallback []string) []string {
	if v := os.Getenv(key); v != "" {
		parts := strings.Split(v, ",")
		result := make([]string, 0, len(parts))
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				result = append(result, p)
			}
		}
		return result
	}
	return fallback
}
