package http

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lcdpc/lcdpc-go/configs"
	"github.com/lcdpc/lcdpc-go/internal/apitoken"
	"github.com/lcdpc/lcdpc-go/internal/auth"
	"github.com/lcdpc/lcdpc-go/internal/branch"
	"github.com/lcdpc/lcdpc-go/internal/brand"
	"github.com/lcdpc/lcdpc-go/internal/category"
	"github.com/lcdpc/lcdpc-go/internal/dashboard"
	assistant "github.com/lcdpc/lcdpc-go/internal/external/assistant"
	"github.com/lcdpc/lcdpc-go/internal/http/handler"
	"github.com/lcdpc/lcdpc-go/internal/http/middleware"
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

func NewServer(
	cfg *configs.Config,
	pool *pgxpool.Pool,
	authSvc *auth.Service,
	oauth2Svc *auth.OAuth2Service,
	keySvc *auth.KeyService,
	saKeySvc *auth.KeyService,
	pricingSvc *pricing.Service,
	branchSvc *branch.Service,
	brandSvc *brand.Service,
	categorySvc *category.Service,
	staffSvc *staff.Service,
	syncSvc *sync.Service,
	rbacStore *rbac.Store,
	rbacSvc *rbac.Service,
	orderSvc *order.Service,
	personSvc *person.Service,
	systemConfigSvc *systemconfig.Service,
	userSvc *user.Service,
	dashboardSvc *dashboard.Service,
	apiTokenSvc *apitoken.Service,
	svcAccountSvc *serviceaccount.Service,
	workflowSvc *workflow.Service,
	assistantClient *assistant.Client,
	frontendFS fs.FS,
) *chi.Mux {
	r := chi.NewRouter()

	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RealIP)
	r.Use(middleware.CORS(cfg.CORSAllowedOrigins))
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.APINoCache())

	// Serve static files with cache + resize support
	staticH := handler.NewStaticHandler("static")
	r.With(middleware.RateLimit(30, time.Minute)).HandleFunc("/static/*", staticH.ServeImage)

	authH := handler.NewAuthHandler(authSvc)
	oauth2H := handler.NewOAuth2Handler(oauth2Svc)
	productH := handler.NewProductHandler(pricingSvc, rbacStore)
	bundleH := handler.NewBundleHandler(pricingSvc, rbacStore)
	priceH := handler.NewPriceHandler(pricingSvc)
	priceCategoryH := handler.NewPriceCategoryHandler(pricingSvc)
	measurementUnitH := handler.NewMeasurementUnitHandler(pricingSvc)
	measurementUnitClassificationH := handler.NewMeasurementUnitClassificationHandler(pricingSvc)
	conversionFactorH := handler.NewConversionFactorHandler(pricingSvc)
	branchH := handler.NewBranchHandler(branchSvc, rbacStore)
	brandH := handler.NewBrandHandler(brandSvc)
	categoryH := handler.NewCategoryHandler(categorySvc)
	staffH := handler.NewStaffHandler(staffSvc, rbacStore)
	syncH := handler.NewSyncHandler(syncSvc)
	healthH := handler.NewHealthHandler(pool)
	rbacH := rbac.NewHandler(rbacSvc)
	orderH := order.NewHandler(orderSvc, rbacStore)
	personH := handler.NewPersonHandler(personSvc)
	systemConfigH := handler.NewSystemConfigHandler(systemConfigSvc)
	userH := handler.NewUserHandler(userSvc)
	dashboardH := dashboard.NewHandler(dashboardSvc, rbacStore)
	apiTokenH := apitoken.NewHandler(apiTokenSvc)
	svcAccountH := serviceaccount.NewHandler(svcAccountSvc)
	saPricingH := handler.NewSAPricingHandler(pricingSvc, rbacStore, cfg.CatalogDomain)
	saBranchH := handler.NewSABranchHandler(branchSvc, rbacStore)
	workflowH := workflow.NewHandler(workflowSvc)
	assistantH := assistant.NewHandler(assistantClient)

	// Public
	if frontendFS == nil {
		r.Get("/", func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte(`{"service":"LCDPC.API","status":"ok"}`))
		})
	}
	r.Get("/health", healthH.Ready)
	r.Get("/api/health", healthH.Health)

	// Discovery
	r.Get("/.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		discovery := map[string]interface{}{
			"issuer":                           cfg.OAuth2Issuer,
			"authorization_endpoint":           cfg.OAuth2Issuer + "/oauth2/authorize",
			"token_endpoint":                   cfg.OAuth2Issuer + "/oauth2/token",
			"introspection_endpoint":           cfg.OAuth2Issuer + "/oauth2/introspect",
			"revocation_endpoint":              cfg.OAuth2Issuer + "/oauth2/revoke",
			"response_types_supported":         []string{"code"},
			"grant_types_supported":            []string{"authorization_code", "refresh_token", "client_credentials"},
			"code_challenge_methods_supported": []string{"S256"},
			"subject_types_supported":          []string{"public"},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(discovery)
	})

	// OAuth2 endpoints
	r.Route("/oauth2", func(r chi.Router) {
		r.Get("/authorize", oauth2H.Authorize)
		r.Post("/token", oauth2H.Token)
		r.Post("/introspect", oauth2H.Introspect)
		r.Post("/revoke", oauth2H.Revoke)
	})

	// Auth
	r.Route("/api/v1/auth", func(r chi.Router) {
		r.Post("/register/start", authH.RegisterStart)
		r.Post("/register/verify-email", authH.RegisterVerifyEmail)
		r.Post("/register/check-document", authH.RegisterCheckDocument)
		r.Post("/register/complete", authH.RegisterComplete)
		r.Post("/login", authH.Login)
		r.Post("/forgot-password", authH.ForgotPassword)
		r.Post("/reset-password", authH.ResetPassword)
		r.Get("/security-policy", authH.GetSecurityPolicy)

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())

			r.Get("/me", authH.Me)
			r.Post("/refresh", authH.Refresh)
			r.Post("/logout", authH.Logout)

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "security-policy:update"))
				r.Put("/security-policy", authH.UpdateSecurityPolicy)
			})
		})
	})

	// Products
	r.Route("/api/v1/products", func(r chi.Router) {
		r.Get("/", productH.List)
		r.Get("/{id}", productH.GetByID)

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "product:create"))

			r.Post("/", productH.Create)

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "product:update"))
				r.Put("/{id}", productH.Update)
				r.Put("/{id}/image", productH.UpdateImage)
				r.Patch("/{id}/toggle-active", productH.ToggleActive)
			})

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "product:delete"))
				r.Delete("/{id}", productH.Delete)
			})
		})
	})

	// Bundles
	r.Route("/api/v1/bundles", func(r chi.Router) {
		r.Get("/", bundleH.List)
		r.Get("/{id}", bundleH.GetByID)

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "bundle:create"))
				r.Post("/", bundleH.Create)
			})

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "bundle:update"))
				r.Put("/{id}", bundleH.Update)
				r.Put("/{id}/image", bundleH.UpdateImage)
				r.Patch("/{id}/toggle-active", bundleH.ToggleActive)

				// Bundle prices CRUD
				r.Get("/{id}/prices", bundleH.ListPrices)
				r.Post("/{id}/prices", bundleH.CreatePrice)
				r.Put("/{id}/prices/{priceId}", bundleH.UpdatePrice)
				r.Delete("/{id}/prices/{priceId}", bundleH.DeletePrice)
			})

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "bundle:delete"))
				r.Delete("/{id}", bundleH.Delete)
			})
		})
	})

	// Prices
	r.Route("/api/v1/prices", func(r chi.Router) {
		r.Get("/{id}", priceH.GetByID)
		r.Get("/product/{id}", priceH.ListByProductID)

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "price:create"))
				r.Post("/", priceH.Create)
			})

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "price:update"))
				r.Put("/{id}", priceH.Update)
			})

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "price:delete"))
				r.Delete("/{id}", priceH.Delete)
			})
		})
	})

	// Price Categories
	r.Route("/api/v1/price-categories", func(r chi.Router) {
		r.Get("/", priceCategoryH.List)
		r.Get("/{id}", priceCategoryH.GetByID)

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "price_category:create"))

			r.Post("/", priceCategoryH.Create)

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "price_category:update"))
				r.Put("/{id}", priceCategoryH.Update)
			})

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "price_category:delete"))
				r.Delete("/{id}", priceCategoryH.Delete)
			})
		})
	})

	// Measurement Units
	r.Route("/api/v1/measurement-units", func(r chi.Router) {
		r.Get("/", measurementUnitH.List)
		r.Get("/{id}", measurementUnitH.GetByID)

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "measurement_unit:create"))

			r.Post("/", measurementUnitH.Create)

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "measurement_unit:update"))
				r.Put("/{id}", measurementUnitH.Update)
			})

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "measurement_unit:delete"))
				r.Delete("/{id}", measurementUnitH.Delete)
			})
		})
	})

	// Measurement Unit Classifications
	r.Route("/api/v1/measurement-unit-classifications", func(r chi.Router) {
		r.Get("/", measurementUnitClassificationH.List)
		r.Get("/{id}", measurementUnitClassificationH.GetByID)

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "measurement_unit:create"))

			r.Post("/", measurementUnitClassificationH.Create)

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "measurement_unit:update"))
				r.Put("/{id}", measurementUnitClassificationH.Update)
			})

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "measurement_unit:delete"))
				r.Delete("/{id}", measurementUnitClassificationH.Delete)
			})
		})
	})

	// Conversion Factors
	r.Route("/api/v1/conversion-factors", func(r chi.Router) {
		r.Get("/product/{id}", conversionFactorH.ListByProductID)
		r.Get("/{id}", conversionFactorH.GetByID)

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "measurement_unit:create"))

			r.Post("/", conversionFactorH.Create)

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "measurement_unit:update"))
				r.Put("/{id}", conversionFactorH.Update)
			})

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "measurement_unit:delete"))
				r.Delete("/{id}", conversionFactorH.Delete)
			})
		})
	})

	// Branches
	r.Route("/api/v1/branches", func(r chi.Router) {
		r.Get("/", branchH.List)

		// Admin branch list (filtered by view:branch:all permission)
		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())
			r.Get("/admin", branchH.ListAdmin)
		})

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "branch:create"))
			r.Post("/", branchH.Create)

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "branch:update"))
				r.Put("/{id}", branchH.Update)
			})
		})
	})

	// Brands
	r.Route("/api/v1/brands", func(r chi.Router) {
		r.Get("/", brandH.List)

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "brand:view"))

			r.Get("/{id}", brandH.GetByID)
		})

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "brand:create"))

			r.Post("/", brandH.Create)

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "brand:update"))
				r.Put("/{id}", brandH.Update)
			})

			r.Group(func(r chi.Router) {
				r.Use(middleware.RequirePermission(rbacStore, "brand:delete"))
				r.Delete("/{id}", brandH.Delete)
			})
		})
	})

	// Categories
	r.Route("/api/v1/categories", func(r chi.Router) {
		r.Get("/", categoryH.List)
		r.Get("/{id}", categoryH.GetByID)

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "category:create"))
			r.Post("/", categoryH.Create)
		})

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "category:update"))
			r.Put("/{id}", categoryH.Update)
		})

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "category:delete"))
			r.Delete("/{id}", categoryH.Delete)
		})
	})

	// Staff
	r.Route("/api/v1/staff", func(r chi.Router) {
		r.Get("/", staffH.List)
		r.Get("/{id}", staffH.GetByID)

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "staff:create"))
			r.Post("/", staffH.Create)
			r.Get("/lookup-by-document/{doc}", staffH.LookupByDocument)
			r.Get("/profiles", staffH.ListProfiles)
		})

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "staff:update"))
			r.Put("/{id}", staffH.Update)
			r.Patch("/{id}/toggle-status", staffH.ToggleStatus)
		})

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "staff:delete"))
			r.Delete("/{id}", staffH.Delete)
		})
	})

	// RBAC
	r.Route("/api/v1/rbac", func(r chi.Router) {
		r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
		r.Use(middleware.RequireAuth())

		// Resources
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "rbac:resource:view"))
			r.Get("/resources", rbacH.ListResources)
			r.Get("/resources/{id}", rbacH.GetResource)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "rbac:resource:create"))
			r.Post("/resources", rbacH.CreateResource)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "rbac:resource:update"))
			r.Put("/resources/{id}", rbacH.UpdateResource)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "rbac:resource:delete"))
			r.Delete("/resources/{id}", rbacH.DeleteResource)
		})

		// Roles
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "rbac:role:view"))
			r.Get("/roles", rbacH.ListRoles)
			r.Get("/roles/{id}", rbacH.GetRole)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "rbac:role:create"))
			r.Post("/roles", rbacH.CreateRole)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "rbac:role:update"))
			r.Put("/roles/{id}", rbacH.UpdateRole)
			r.Post("/roles/{id}/resources", rbacH.AssignResourceToRole)
			r.Delete("/roles/{id}/resources/{resourceId}", rbacH.RemoveResourceFromRole)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "rbac:role:delete"))
			r.Delete("/roles/{id}", rbacH.DeleteRole)
		})

		// Profiles
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "rbac:profile:view"))
			r.Get("/profiles", rbacH.ListProfiles)
			r.Get("/profiles/{id}", rbacH.GetProfile)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "rbac:profile:create"))
			r.Post("/profiles", rbacH.CreateProfile)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "rbac:profile:update"))
			r.Put("/profiles/{id}", rbacH.UpdateProfile)
			r.Post("/profiles/{id}/roles", rbacH.AssignRoleToProfile)
			r.Delete("/profiles/{id}/roles/{roleId}", rbacH.RemoveRoleFromProfile)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "rbac:profile:delete"))
			r.Delete("/profiles/{id}", rbacH.DeleteProfile)
		})
	})

	// API Tokens
	r.Route("/api/v1/api-tokens", func(r chi.Router) {
		r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
		r.Use(middleware.RequireAuth())

		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "api_token:view"))
			r.Get("/", apiTokenH.List)
			r.Get("/{id}", apiTokenH.GetByID)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "api_token:create"))
			r.Post("/", apiTokenH.Create)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "api_token:update"))
			r.Put("/{id}", apiTokenH.Update)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "api_token:delete"))
			r.Delete("/{id}", apiTokenH.Delete)
		})
	})

	// Users
	r.Route("/api/v1/users", func(r chi.Router) {
		r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
		r.Use(middleware.RequireAuth())

		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "order:create"))
			r.Get("/", userH.List)
			r.Get("/search", userH.Search)
			r.Get("/by-document/{doc}", userH.GetByDocument)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "rbac:user:update"))
			r.Get("/{id}", userH.GetByID)
			r.Put("/{id}", userH.Update)
			r.Put("/{id}/profile", rbacH.AssignProfileToUser)
		})
	})

	// Persons
	r.Route("/api/v1/persons", func(r chi.Router) {
		r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
		r.Get("/by-document/{doc}", personH.GetByDocument)
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireAuth())
			r.Post("/upsert", personH.Upsert)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "client:create"))
			r.Post("/clients", personH.CreateClient)
			r.Get("/lookup-by-document/{doc}", personH.LookupByDocument)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "client:view"))
			r.Get("/clients", personH.ListClients)
			r.Get("/clients/{id}", personH.GetClientByID)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "client:update"))
			r.Put("/clients/{id}", personH.UpdateClient)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "client:delete"))
			r.Delete("/clients/{id}", personH.DeleteClient)
		})
	})

	// Orders
	r.Route("/api/v1/orders", func(r chi.Router) {
		r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))

		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "order:view"))
			r.Get("/", orderH.List)
			r.Get("/matrix", orderH.ListMatrix)
			r.Get("/{id}", orderH.GetByID)
			r.Get("/{id}/history", orderH.GetHistory)
		})
		r.Group(func(r chi.Router) {
			r.Post("/", orderH.Create)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "order:update"))
			r.Put("/{id}", orderH.Update)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "order:delete"))
			r.Delete("/{id}", orderH.Delete)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "order:status:change"))
			r.Post("/{id}/status", orderH.ChangeStatus)
			r.Get("/{id}/transitions", orderH.GetValidTransitions)
		})
	})

	// Sync (API Key protected)
	r.Route("/api/v1/sync", func(r chi.Router) {
		r.Use(middleware.APIKeyAuth(pool))
		r.Post("/products", syncH.SyncProducts)
		r.Post("/bundles", syncH.SyncBundles)
		r.Post("/products/{sku}/image", syncH.SyncProductImage)
		r.Post("/bundles/{code}/image", syncH.SyncBundleImage)
	})

	// System Config (public individual endpoints)
	r.Get("/api/v1/system/logo", systemConfigH.GetLogo)
	r.Get("/api/v1/system/icon", systemConfigH.GetIcon)
	r.Get("/api/v1/system/page-name", systemConfigH.GetPageName)
	r.Get("/api/v1/system/title", systemConfigH.GetTitle)
	r.Get("/api/v1/system/show-price", systemConfigH.GetShowPrice)
	r.Get("/api/v1/system/negative-stock", systemConfigH.GetNegativeStock)

	// System Config (protected CRUD)
	r.Route("/api/v1/system-config", func(r chi.Router) {
		r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
		r.Use(middleware.RequireAuth())
		r.Use(middleware.RequirePermission(rbacStore, "system_config:view"))

		r.Get("/", systemConfigH.List)
		r.Get("/active", systemConfigH.GetActive)

		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "system_config:update"))
			r.Post("/", systemConfigH.Create)
			r.Put("/{id}", systemConfigH.Update)
		})
	})

	// Dashboard
	r.Route("/api/v1/dashboard", func(r chi.Router) {
		r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
		r.Use(middleware.RequireAuth())

		r.Get("/summary", dashboardH.Summary)
		r.Get("/orders-by-status", dashboardH.OrdersByStatus)
		r.Get("/sales-trend", dashboardH.SalesTrend)
		r.Get("/top-products", dashboardH.TopProducts)
		r.Get("/top-bundles", dashboardH.TopBundles)
		r.Get("/stock-health", dashboardH.StockHealth)
	})

	// Service Accounts (regular user auth)
	r.Route("/api/v1/service-accounts", func(r chi.Router) {
		r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
		r.Use(middleware.RequireAuth())

		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "service_account:view"))
			r.Get("/", svcAccountH.List)
			r.Get("/{id}", svcAccountH.GetByID)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "service_account:create"))
			r.Post("/", svcAccountH.Create)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "service_account:update"))
			r.Put("/{id}", svcAccountH.Update)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "service_account:delete"))
			r.Delete("/{id}", svcAccountH.Delete)
		})
	})

	// Service Account endpoints (SA PASETO key)
	r.Route("/api/v1/sa", func(r chi.Router) {
		r.Use(middleware.ServiceAccountAuth(saKeySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
		r.Use(middleware.RequireAuth())

		r.Get("/products", saPricingH.ListProducts)
		r.Get("/bundles", saPricingH.ListBundles)
		r.Get("/branches", saBranchH.List)
	})

	// Order Statuses (public read + protected deactivate)
	r.Route("/api/v1/order-statuses", func(r chi.Router) {
		r.Get("/", workflowH.ListOrderStatuses)

		r.Group(func(r chi.Router) {
			r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
			r.Use(middleware.RequireAuth())
			r.Use(middleware.RequirePermission(rbacStore, "workflow:update"))
			r.Patch("/{code}/deactivate", workflowH.DeactivateStatus)
		})
	})

	// Order Transitions (public read)
	r.Get("/api/v1/order-transitions", workflowH.ListOrderTransitions)

	// Workflows (protected CRUD)
	r.Route("/api/v1/workflows", func(r chi.Router) {
		r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
		r.Use(middleware.RequireAuth())

		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "workflow:view"))
			r.Get("/", workflowH.ListWorkflows)
			r.Get("/{id}", workflowH.GetWorkflowByID)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "workflow:create"))
			r.Post("/", workflowH.CreateWorkflow)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "workflow:update"))
			r.Put("/{id}", workflowH.UpdateWorkflow)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(rbacStore, "workflow:delete"))
			r.Delete("/{id}", workflowH.DeleteWorkflow)
		})
	})

	// External Assistant API (SmartWorker)
	r.Route("/api/v1/external/assistant", func(r chi.Router) {
		r.Use(middleware.PASETOAuth(keySvc.Key(), cfg.OAuth2Issuer, cfg.OAuth2Audience))
		r.Use(middleware.RequireAuth())
		r.Use(middleware.RequirePermission(rbacStore, "assistant:view"))

		r.Get("/leads", assistantH.ListLeads)
		r.Get("/orders", assistantH.ListOrders)
	})

	// SPA frontend (embedded)
	if frontendFS != nil {
		subFS, err := fs.Sub(frontendFS, "frontend")
		if err != nil {
			panic("failed to create sub filesystem for frontend: " + err.Error())
		}
		spaH := handler.NewSPAHandler(subFS)
		r.NotFound(spaH.ServeHTTP)
	}

	return r
}
