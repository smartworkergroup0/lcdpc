package main

import (
	"context"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/lcdpc/lcdpc-go/configs"
	"github.com/lcdpc/lcdpc-go/internal/apitoken"
	"github.com/lcdpc/lcdpc-go/internal/auth"
	"github.com/lcdpc/lcdpc-go/internal/branch"
	"github.com/lcdpc/lcdpc-go/internal/brand"
	"github.com/lcdpc/lcdpc-go/internal/category"
	"github.com/lcdpc/lcdpc-go/internal/dashboard"
	"github.com/lcdpc/lcdpc-go/internal/db"
	"github.com/lcdpc/lcdpc-go/internal/email"
	assistant "github.com/lcdpc/lcdpc-go/internal/external/assistant"
	httpserver "github.com/lcdpc/lcdpc-go/internal/http"
	"github.com/lcdpc/lcdpc-go/internal/order"
	"github.com/lcdpc/lcdpc-go/internal/person"
	"github.com/lcdpc/lcdpc-go/internal/pricing"
	"github.com/lcdpc/lcdpc-go/internal/rbac"
	"github.com/lcdpc/lcdpc-go/internal/serviceaccount"
	"github.com/lcdpc/lcdpc-go/internal/staff"
	"github.com/lcdpc/lcdpc-go/internal/sync"
	"github.com/lcdpc/lcdpc-go/internal/systemconfig"
	"github.com/lcdpc/lcdpc-go/internal/user"
	"github.com/lcdpc/lcdpc-go/internal/workflow"
)

func main() {
	_ = godotenv.Load()
	encryptKey := flag.String("encrypt-paseto-key", "", "Encrypt paseto.key with the given master key (64 hex chars) and exit")
	encryptSAKey := flag.String("encrypt-paseto-sa-key", "", "Encrypt paseto_sa.key with the given master key (64 hex chars) and exit")
	flag.Parse()

	if *encryptKey != "" {
		if err := auth.EncryptKeyFile("paseto.key", *encryptKey); err != nil {
			slog.Error("failed to encrypt key file", "error", err)
			os.Exit(1)
		}
		slog.Info("paseto.key encrypted successfully")
		return
	}

	if *encryptSAKey != "" {
		if err := auth.EncryptKeyFile("paseto_sa.key", *encryptSAKey); err != nil {
			slog.Error("failed to encrypt service account key file", "error", err)
			os.Exit(1)
		}
		slog.Info("paseto_sa.key encrypted successfully")
		return
	}

	ctx := context.Background()
	cfg := configs.Load()

	if err := os.MkdirAll("static/img", 0755); err != nil {
		slog.Error("failed to create static directory", "error", err)
		os.Exit(1)
	}

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	slog.Info("database connected")

	if err := db.RunMigrations(cfg.DatabaseURL); err != nil {
		slog.Error("failed to run migrations", "error", err)
		os.Exit(1)
	}

	if err := db.Seed(ctx, pool, db.SeedConfig{
		SuperUserPassword:         cfg.SuperUserPassword,
		SuperUserAlias:            cfg.SuperUserAlias,
		SuperUserEmail:            cfg.SuperUserEmail,
		SuperUserFirstName:        cfg.SuperUserFirstName,
		SuperUserLastName:         cfg.SuperUserLastName,
		SuperUserIdentityDocument: cfg.SuperUserIdentityDocument,
		SuperUserWhatsAppPhone:    cfg.SuperUserWhatsAppPhone,
		SuperUserFullAddress:      cfg.SuperUserFullAddress,
	}); err != nil {
		slog.Error("failed to seed database", "error", err)
		os.Exit(1)
	}

	keySvc, err := auth.NewKeyService(cfg.PasetoKeyPath, cfg.PasetoDecryptionKey)
	if err != nil {
		slog.Error("failed to initialize key service", "error", err)
		os.Exit(1)
	}

	saKeySvc, err := auth.NewKeyService(cfg.PasetoSAKeyPath, cfg.PasetoSADecryptionKey)
	if err != nil {
		slog.Error("failed to initialize service account key service", "error", err)
		os.Exit(1)
	}

	rbacStore := rbac.NewStore()
	if err := rbacStore.LoadFromDB(ctx, pool); err != nil {
		slog.Error("failed to load RBAC store", "error", err)
		os.Exit(1)
	}

	var emailSvc email.Sender
	switch cfg.EmailDriver {
	case "smtp":
		emailSvc = email.NewSMTPSender(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUsername, cfg.SMTPPassword, cfg.SMTPFrom)
		slog.Info("email driver configured", "driver", "smtp", "host", cfg.SMTPHost, "port", cfg.SMTPPort)
	case "resend":
		if cfg.ResendAPIKey != "" {
			emailSvc = email.NewResendSender(cfg.ResendAPIKey, cfg.ResendFrom)
			slog.Info("email driver configured", "driver", "resend")
		} else {
			emailSvc = &email.NoopSender{}
			slog.Warn("RESEND_APITOKEN not set, emails will not be sent")
		}
	default:
		emailSvc = &email.NoopSender{}
		slog.Warn("unknown EMAIL_DRIVER, falling back to noop", "driver", cfg.EmailDriver)
	}

	authSvc := auth.NewService(pool, emailSvc, keySvc, auth.Config{
		PasswordResetTTLMinutes:       cfg.PasswordResetTTLMinutes,
		RevokeSessionsOnPasswordReset: cfg.RevokeSessionsOnPasswordReset,
		OAuth2Issuer:                  cfg.OAuth2Issuer,
		OAuth2Audience:                cfg.OAuth2Audience,
		AccessTokenTTLMin:             cfg.OAuth2AccessTokenTTLMin,
	}, rbacStore)

	oauth2Svc := auth.NewOAuth2Service(pool, keySvc, saKeySvc.Key(), auth.OAuth2Config{
		AccessTokenTTLMin:   cfg.OAuth2AccessTokenTTLMin,
		RefreshTokenTTLDays: cfg.OAuth2RefreshTokenTTLDays,
		AuthCodeTTLMinutes:  cfg.OAuth2AuthCodeTTLMinutes,
		Issuer:              cfg.OAuth2Issuer,
		Audience:            cfg.OAuth2Audience,
	})

	systemConfigSvc := systemconfig.NewService(pool)
	pricingSvc := pricing.NewService(pool, systemConfigSvc)
	branchSvc := branch.NewService(pool)
	brandSvc := brand.NewService(pool)
	categorySvc := category.NewService(pool)
	staffSvc := staff.NewService(pool, rbacStore)
	syncSvc := sync.NewService(pool, systemConfigSvc)
	rbacSvc := rbac.NewService(pool, rbacStore)
	workflowSvc := workflow.NewService(pool)
	orderSvc := order.NewService(pool, systemConfigSvc, workflowSvc, workflowSvc)
	personSvc := person.NewService(pool)
	userSvc := user.NewService(pool)
	dashboardSvc := dashboard.NewService(pool)
	apiTokenSvc := apitoken.NewService(pool)
	svcAccountSvc := serviceaccount.NewService(pool)
	assistantClient := assistant.NewClient(cfg.SmartWorkerAPIURL, cfg.SmartWorkerUser, cfg.SmartWorkerPass)

	router := httpserver.NewServer(cfg, pool, authSvc, oauth2Svc, keySvc, saKeySvc, pricingSvc, branchSvc, brandSvc, categorySvc, staffSvc, syncSvc, rbacStore, rbacSvc, orderSvc, personSvc, systemConfigSvc, userSvc, dashboardSvc, apiTokenSvc, svcAccountSvc, workflowSvc, assistantClient, frontendFS)

	addr := ":" + cfg.Port
	srv := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		slog.Info("shutting down...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			slog.Error("server shutdown error", "error", err)
		}
	}()

	slog.Info("server starting", "addr", addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}
}
