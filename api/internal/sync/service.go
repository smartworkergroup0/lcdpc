package sync

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lcdpc/lcdpc-go/internal/pricing"
	"github.com/lcdpc/lcdpc-go/internal/shared"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

const maxSyncBatchSize = 500

type SystemConfigReader interface {
	GetNegativeStock(ctx context.Context) (bool, error)
}

type Service struct {
	pool   *pgxpool.Pool
	sysCfg SystemConfigReader
}

func NewService(pool *pgxpool.Pool, sysCfg SystemConfigReader) *Service {
	return &Service{pool: pool, sysCfg: sysCfg}
}

// ---------------------------------------------------------------------------
// Request / response structs
// ---------------------------------------------------------------------------

type SyncProductRequest struct {
	Name         string             `json:"name"`
	Code         string             `json:"code"`
	IsActive     bool               `json:"is_active"`
	BrandCode    string             `json:"brand_code"`
	BrandName    *string            `json:"brand_name"`
	CategoryCode *string            `json:"category_code"`
	CategoryName *string            `json:"category_name"`
	BranchCode   string             `json:"branch_code"`
	BaseUnitCode *string            `json:"base_unit_code"`
	BaseUnitName *string            `json:"base_unit_name"`
	Stock        *float64           `json:"stock"`
	Prices       []SyncProductPrice `json:"prices"`
}

type SyncProductPrice struct {
	Code   *string `json:"code"`
	Amount float64 `json:"amount"`
}

type SyncBundleRequest struct {
	Code               string            `json:"code"`
	Name               string            `json:"name"`
	IsActive           bool              `json:"is_active"`
	BranchCode         string            `json:"branch_code"`
	CategoryCode       *string           `json:"category_code"`
	CategoryName       *string           `json:"category_name"`
	Items              []SyncBundleItem  `json:"items"`
	Prices             []SyncBundlePrice `json:"prices"`
	Stock              *float64          `json:"stock"`
	BlocksProductStock bool              `json:"blocks_product_stock"`
}

type SyncBundleItem struct {
	ProductCode string  `json:"product_code"`
	Quantity    float64 `json:"quantity"`
}

type SyncBundlePrice struct {
	Code   *string `json:"code"`
	Amount float64 `json:"amount"`
}

type SyncError struct {
	Identifier string `json:"identifier"`
	Message    string `json:"message"`
}

type SyncResult struct {
	Processed int         `json:"processed"`
	Errors    int         `json:"errors"`
	Details   []SyncError `json:"details,omitempty"`
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

func (p SyncProductRequest) identifier() string {
	if p.Code != "" {
		return p.Code
	}
	if p.Name != "" {
		return fmt.Sprintf("(name=%q)", p.Name)
	}
	return "(unknown)"
}

func (p SyncProductRequest) validate() error {
	if p.Name == "" {
		return fmt.Errorf("name is required")
	}
	if p.Code == "" {
		return fmt.Errorf("code is required")
	}
	if p.BrandCode == "" {
		return fmt.Errorf("brand_code is required")
	}
	if p.BranchCode == "" {
		return fmt.Errorf("branch_code is required")
	}
	return nil
}

func (b SyncBundleRequest) identifier() string {
	if b.Code != "" {
		return b.Code
	}
	if b.Name != "" {
		return fmt.Sprintf("(name=%q)", b.Name)
	}
	return "(unknown)"
}

func (b SyncBundleRequest) validate() error {
	if b.Name == "" {
		return fmt.Errorf("name is required")
	}
	if b.Code == "" {
		return fmt.Errorf("code is required")
	}
	if b.BranchCode == "" {
		return fmt.Errorf("branch_code is required")
	}
	return nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

var slugRe = regexp.MustCompile(`[^A-Z0-9]+`)

func slugify(name string) string {
	t := transform.Chain(norm.NFD, transform.RemoveFunc(func(r rune) bool {
		return unicode.Is(unicode.Mn, r)
	}))
	s, _, _ := transform.String(t, name)
	s = strings.ToUpper(s)
	s = slugRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > 50 {
		s = s[:50]
		s = strings.TrimRight(s, "-")
	}
	if s == "" {
		return "ITEM"
	}
	return s
}

// ---------------------------------------------------------------------------
// Code → UUID resolvers
// ---------------------------------------------------------------------------

func (s *Service) resolveBranchID(ctx context.Context, tx pgx.Tx, code string) (uuid.UUID, error) {
	var id uuid.UUID
	err := tx.QueryRow(ctx, `SELECT id FROM branches WHERE code = $1`, code).Scan(&id)
	if err == pgx.ErrNoRows {
		return uuid.Nil, fmt.Errorf("branch_code %q not found", code)
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("resolve branch: %w", err)
	}
	return id, nil
}

func (s *Service) resolveCategoryID(ctx context.Context, tx pgx.Tx, code *string, name *string) (*uuid.UUID, error) {
	if code == nil && name == nil {
		return nil, nil
	}

	// 1. Try by code
	if code != nil {
		newCode := slugify(*code)
		var id uuid.UUID
		err := tx.QueryRow(ctx, `SELECT category_id FROM categories WHERE code = $1`, newCode).Scan(&id)
		if err == nil {
			return &id, nil
		}
		if err != pgx.ErrNoRows {
			return nil, fmt.Errorf("resolve category: %w", err)
		}
	}

	// 2. Try by name
	if name != nil {
		var id uuid.UUID
		err := tx.QueryRow(ctx, `SELECT category_id FROM categories WHERE name = $1`, *name).Scan(&id)
		if err == nil {
			return &id, nil
		}
		if err != pgx.ErrNoRows {
			return nil, fmt.Errorf("resolve category by name: %w", err)
		}
	}

	// 3. Auto-create
	displayName := ""
	if name != nil {
		displayName = *name
	} else if code != nil {
		displayName = *code
	}
	newCode := slugify(displayName)

	var id uuid.UUID
	err := tx.QueryRow(ctx, `
		INSERT INTO categories (category_id, name, code) VALUES ($1, $2, $3)
		RETURNING category_id
	`, uuid.New(), displayName, newCode).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("auto-create category: %w", err)
	}
	return &id, nil
}

func (s *Service) resolveBrandID(ctx context.Context, tx pgx.Tx, code string, name *string) (uuid.UUID, error) {
	newCode := slugify(code)
	var id uuid.UUID
	err := tx.QueryRow(ctx, `SELECT id FROM brands WHERE code = $1`, newCode).Scan(&id)
	if err == nil {
		return id, nil
	}
	if err != pgx.ErrNoRows {
		return uuid.Nil, fmt.Errorf("resolve brand: %w", err)
	}

	displayName := code
	if name != nil && *name != "" {
		displayName = *name
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO brands (id, name, code) VALUES ($1, $2, $3)
		RETURNING id
	`, uuid.New(), displayName, newCode).Scan(&id)
	if err != nil {
		return uuid.Nil, fmt.Errorf("auto-create brand: %w", err)
	}
	return id, nil
}

func (s *Service) resolveProductID(ctx context.Context, tx pgx.Tx, sku string, branchID uuid.UUID) (uuid.UUID, error) {
	var id uuid.UUID
	err := tx.QueryRow(ctx, `SELECT product_id FROM products WHERE sku = $1 AND branch_id = $2`, sku, branchID).Scan(&id)
	if err == pgx.ErrNoRows {
		return uuid.Nil, fmt.Errorf("product with code %q not found for branch", sku)
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("resolve product: %w", err)
	}
	return id, nil
}

func (s *Service) resolvePriceCategoryID(ctx context.Context, tx pgx.Tx, code *string) (*uuid.UUID, error) {
	if code == nil {
		return nil, nil
	}
	newCode := slugify(*code)
	var id uuid.UUID
	err := tx.QueryRow(ctx, `SELECT id FROM price_categories WHERE code = $1`, newCode).Scan(&id)
	if err == nil {
		return &id, nil
	}
	if err != pgx.ErrNoRows {
		return nil, fmt.Errorf("resolve price category: %w", err)
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO price_categories (id, name, code) VALUES ($1, $2, $3)
		RETURNING id
	`, uuid.New(), *code, newCode).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("auto-create price category: %w", err)
	}
	return &id, nil
}

// ---------------------------------------------------------------------------
// Batch resolvers — pre-resolve all unique codes before the item loop
// ---------------------------------------------------------------------------

type BrandCodeName struct {
	Code string
	Name *string
}

func (s *Service) resolveBrandIDs(ctx context.Context, tx pgx.Tx, items []BrandCodeName) (map[string]uuid.UUID, error) {
	seen := make(map[string]struct{})
	unique := make([]BrandCodeName, 0, len(items))
	for _, item := range items {
		if _, dup := seen[slugify(item.Code)]; !dup {
			seen[slugify(item.Code)] = struct{}{}
			unique = append(unique, item)
		}
	}

	result := make(map[string]uuid.UUID, len(unique))
	for _, item := range unique {
		id, err := s.resolveBrandID(ctx, tx, item.Code, item.Name)
		if err != nil {
			return nil, err
		}
		result[item.Code] = id
	}
	return result, nil
}

func (s *Service) resolveBranchIDs(ctx context.Context, tx pgx.Tx, codes []string) (map[string]uuid.UUID, error) {
	seen := make(map[string]struct{})
	unique := make([]string, 0, len(codes))
	for _, c := range codes {
		if _, dup := seen[c]; !dup {
			seen[c] = struct{}{}
			unique = append(unique, c)
		}
	}

	result := make(map[string]uuid.UUID, len(unique))
	for _, code := range unique {
		id, err := s.resolveBranchID(ctx, tx, code)
		if err != nil {
			return nil, err
		}
		result[code] = id
	}
	return result, nil
}

func (s *Service) resolvePriceCategoryIDs(ctx context.Context, tx pgx.Tx, codes []*string) (map[string]uuid.UUID, error) {
	seen := make(map[string]struct{})
	unique := make([]*string, 0, len(codes))
	for _, c := range codes {
		if c == nil {
			continue
		}
		if _, dup := seen[slugify(*c)]; !dup {
			seen[slugify(*c)] = struct{}{}
			unique = append(unique, c)
		}
	}

	result := make(map[string]uuid.UUID, len(unique))
	for _, code := range unique {
		id, err := s.resolvePriceCategoryID(ctx, tx, code)
		if err != nil {
			return nil, err
		}
		if id != nil {
			result[*code] = *id
		}
	}
	return result, nil
}

func (s *Service) resolveMeasurementUnitID(ctx context.Context, tx pgx.Tx, code *string, name *string) (*uuid.UUID, error) {
	if code == nil && name == nil {
		return nil, nil
	}

	// 1. Try by code
	if code != nil {
		newCode := slugify(*code)
		var id uuid.UUID
		err := tx.QueryRow(ctx, `SELECT id FROM measurement_units WHERE code = $1`, newCode).Scan(&id)
		if err == nil {
			return &id, nil
		}
		if err != pgx.ErrNoRows {
			return nil, fmt.Errorf("resolve measurement unit: %w", err)
		}
	}

	// 2. Try by name
	if name != nil {
		var id uuid.UUID
		err := tx.QueryRow(ctx, `SELECT id FROM measurement_units WHERE name = $1`, *name).Scan(&id)
		if err == nil {
			return &id, nil
		}
		if err != pgx.ErrNoRows {
			return nil, fmt.Errorf("resolve measurement unit by name: %w", err)
		}
	}

	// 3. Auto-create
	displayName := ""
	if name != nil {
		displayName = *name
	} else if code != nil {
		displayName = *code
	}
	newCode := slugify(displayName)

	var classID *uuid.UUID
	var cid uuid.UUID
	err := tx.QueryRow(ctx, `SELECT id FROM measurement_unit_classifications WHERE code = 'generic'`).Scan(&cid)
	if err == nil {
		classID = &cid
	}

	var id uuid.UUID
	err = tx.QueryRow(ctx, `
		INSERT INTO measurement_units (id, name, code, symbol, classification_id) VALUES ($1, $2, $3, '', $4)
		RETURNING id
	`, uuid.New(), displayName, newCode, classID).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("auto-create measurement unit: %w", err)
	}
	return &id, nil
}

// ---------------------------------------------------------------------------
// SyncProducts
// ---------------------------------------------------------------------------

func (s *Service) SyncProducts(ctx context.Context, products []SyncProductRequest) (*SyncResult, error) {
	if len(products) > maxSyncBatchSize {
		return nil, fmt.Errorf("max %d items per request", maxSyncBatchSize)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Pre-resolve all unique codes before the item loop to avoid duplicate
	// auto-create conflicts when multiple items reference the same code.
	brandItems := make([]BrandCodeName, 0, len(products))
	branchCodes := make([]string, 0, len(products))
	priceCodes := make([]*string, 0)
	for _, p := range products {
		brandItems = append(brandItems, BrandCodeName{Code: p.BrandCode, Name: p.BrandName})
		branchCodes = append(branchCodes, p.BranchCode)
		for _, price := range p.Prices {
			priceCodes = append(priceCodes, price.Code)
		}
	}

	brandMap, err := s.resolveBrandIDs(ctx, tx, brandItems)
	if err != nil {
		return nil, fmt.Errorf("pre-resolve brands: %w", err)
	}
	branchMap, err := s.resolveBranchIDs(ctx, tx, branchCodes)
	if err != nil {
		return nil, fmt.Errorf("pre-resolve branches: %w", err)
	}
	priceCatMap, err := s.resolvePriceCategoryIDs(ctx, tx, priceCodes)
	if err != nil {
		return nil, fmt.Errorf("pre-resolve price categories: %w", err)
	}

	negativeStock, _ := s.sysCfg.GetNegativeStock(ctx)

	result := &SyncResult{}
	for i, p := range products {
		sp := fmt.Sprintf("sp_%d", i)
		tx.Exec(ctx, "SAVEPOINT "+sp)

		if err := p.validate(); err != nil {
			tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
			result.Errors++
			result.Details = append(result.Details, SyncError{Identifier: p.identifier(), Message: err.Error()})
			continue
		}

		// Resolve codes → UUIDs (brand from pre-resolved map)
		brandID := brandMap[p.BrandCode]

		categoryID, err := s.resolveCategoryID(ctx, tx, p.CategoryCode, p.CategoryName)
		if err != nil {
			tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
			result.Errors++
			result.Details = append(result.Details, SyncError{Identifier: p.identifier(), Message: err.Error()})
			continue
		}

		branchID := branchMap[p.BranchCode]

		baseUnitID, err := s.resolveMeasurementUnitID(ctx, tx, p.BaseUnitCode, p.BaseUnitName)
		if err != nil {
			tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
			result.Errors++
			result.Details = append(result.Details, SyncError{Identifier: p.identifier(), Message: err.Error()})
			continue
		}

		// Stock handling
		stock := 0.0
		if p.Stock != nil {
			stock = *p.Stock
			if err := shared.ValidateDecimalPrecision(stock, shared.MaxStockDecimals); err != nil {
				tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
				result.Errors++
				result.Details = append(result.Details, SyncError{Identifier: p.identifier(), Message: err.Error()})
				continue
			}
		}

		stockAvail := stock
		stockBlocked := 0.0
		var currentStock, currentBlocked float64
		var productID uuid.UUID

		err = tx.QueryRow(ctx, `
			SELECT product_id, stock, stock_blocked FROM products WHERE sku = $1 AND branch_id = $2 FOR UPDATE
		`, p.Code, branchID).Scan(&productID, &currentStock, &currentBlocked)
		if err == nil {
			// Product exists — compute delta
			delta := stock - currentStock
			stockAvail = (currentStock - currentBlocked) + delta
			stockBlocked = currentBlocked

			if stock < 0 && !negativeStock {
				tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
				result.Errors++
				result.Details = append(result.Details, SyncError{Identifier: p.identifier(), Message: "STOCK_BELOW_ZERO"})
				continue
			}
			if stockAvail < 0 && !negativeStock {
				tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
				result.Errors++
				result.Details = append(result.Details, SyncError{Identifier: p.identifier(), Message: "STOCK_AVAILABLE_BELOW_ZERO"})
				continue
			}
			if stockBlocked > stock {
				tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
				result.Errors++
				result.Details = append(result.Details, SyncError{Identifier: p.identifier(), Message: "STOCK_BLOCKED_EXCEEDS_STOCK"})
				continue
			}
		} else if err == pgx.ErrNoRows {
			stockAvail = stock
			stockBlocked = 0
		} else {
			tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
			result.Errors++
			result.Details = append(result.Details, SyncError{Identifier: p.identifier(), Message: "lookup failed"})
			continue
		}

		// Upsert product
		err = tx.QueryRow(ctx, `
			INSERT INTO products (product_id, name, sku, is_active, brand_id, category_id, branch_id, base_unit_id, stock, stock_available, stock_blocked)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
			ON CONFLICT (sku, branch_id) DO UPDATE SET
				name = EXCLUDED.name,
				is_active = EXCLUDED.is_active,
				brand_id = EXCLUDED.brand_id,
				category_id = EXCLUDED.category_id,
				base_unit_id = EXCLUDED.base_unit_id,
				stock = EXCLUDED.stock,
				stock_available = EXCLUDED.stock_available,
				stock_blocked = EXCLUDED.stock_blocked
			RETURNING product_id
		`, uuid.New(), p.Name, p.Code, p.IsActive, brandID, categoryID, branchID, baseUnitID, stock, stockAvail, stockBlocked).Scan(&productID)
		if err != nil {
			tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
			result.Errors++
			result.Details = append(result.Details, SyncError{Identifier: p.identifier(), Message: err.Error()})
			continue
		}

		// Replace product prices (using pre-resolved price category map)
		if _, err := tx.Exec(ctx, `DELETE FROM product_branch_prices WHERE product_id = $1`, productID); err != nil {
			tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
			result.Errors++
			result.Details = append(result.Details, SyncError{Identifier: p.identifier(), Message: fmt.Sprintf("delete prices: %v", err)})
			continue
		}
		priceFailed := false
		for _, price := range p.Prices {
			var pcID *uuid.UUID
			if price.Code != nil {
				if id, ok := priceCatMap[*price.Code]; ok {
					pcID = &id
				}
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO product_branch_prices (id, product_id, price_category_id, amount, currency)
				VALUES ($1, $2, $3, $4, 'USD')
			`, uuid.New(), productID, pcID, price.Amount); err != nil {
				tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
				result.Errors++
				result.Details = append(result.Details, SyncError{Identifier: p.identifier(), Message: fmt.Sprintf("price insert: %v", err)})
				priceFailed = true
				break
			}
		}
		if priceFailed {
			continue
		}

		tx.Exec(ctx, "RELEASE SAVEPOINT "+sp)
		result.Processed++
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return result, nil
}

// ---------------------------------------------------------------------------
// SyncBundles
// ---------------------------------------------------------------------------

func (s *Service) SyncBundles(ctx context.Context, bundles []SyncBundleRequest) (*SyncResult, error) {
	if len(bundles) > maxSyncBatchSize {
		return nil, fmt.Errorf("max %d items per request", maxSyncBatchSize)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Pre-resolve all unique codes before the item loop to avoid duplicate
	// auto-create conflicts when multiple items reference the same code.
	branchCodes := make([]string, 0, len(bundles))
	priceCodes := make([]*string, 0)
	for _, b := range bundles {
		branchCodes = append(branchCodes, b.BranchCode)
		for _, p := range b.Prices {
			priceCodes = append(priceCodes, p.Code)
		}
	}

	branchMap, err := s.resolveBranchIDs(ctx, tx, branchCodes)
	if err != nil {
		return nil, fmt.Errorf("pre-resolve branches: %w", err)
	}
	priceCatMap, err := s.resolvePriceCategoryIDs(ctx, tx, priceCodes)
	if err != nil {
		return nil, fmt.Errorf("pre-resolve price categories: %w", err)
	}

	result := &SyncResult{}
	for i, b := range bundles {
		sp := fmt.Sprintf("sp_%d", i)
		tx.Exec(ctx, "SAVEPOINT "+sp)

		if err := b.validate(); err != nil {
			tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
			result.Errors++
			result.Details = append(result.Details, SyncError{Identifier: b.identifier(), Message: err.Error()})
			continue
		}

		// Map is_active → status
		status := "Paused"
		if b.IsActive {
			status = "Active"
		}

		// Resolve codes → UUIDs
		branchID := branchMap[b.BranchCode]

		categoryID, err := s.resolveCategoryID(ctx, tx, b.CategoryCode, b.CategoryName)
		if err != nil {
			tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
			result.Errors++
			result.Details = append(result.Details, SyncError{Identifier: b.identifier(), Message: err.Error()})
			continue
		}

		// 1. Check existing bundle state for chain recalculation
		var bundleID uuid.UUID
		var oldStock float64
		var oldBlocksProductStock bool
		err = tx.QueryRow(ctx, `
			SELECT bundle_id, stock, blocks_product_stock FROM bundles WHERE code = $1 AND branch_id = $2 FOR UPDATE
		`, b.Code, branchID).Scan(&bundleID, &oldStock, &oldBlocksProductStock)
		bundleExists := err != pgx.ErrNoRows

		if err != nil && err != pgx.ErrNoRows {
			tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
			result.Errors++
			result.Details = append(result.Details, SyncError{Identifier: b.identifier(), Message: "lookup failed"})
			continue
		}

		if bundleExists && oldBlocksProductStock && oldStock > 0 {
			oldItems := make([]pricing.ChainItem, 0)
			rows, qErr := tx.Query(ctx, `SELECT product_id, quantity FROM bundle_items WHERE bundle_id = $1`, bundleID)
			if qErr == nil {
				for rows.Next() {
					var ci pricing.ChainItem
					if scanErr := rows.Scan(&ci.ProductID, &ci.Quantity); scanErr == nil {
						oldItems = append(oldItems, ci)
					}
				}
				rows.Close()
			}
			if err := pricing.ReleaseProductStock(ctx, tx, oldItems, oldStock); err != nil {
				tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
				result.Errors++
				result.Details = append(result.Details, SyncError{Identifier: b.identifier(), Message: err.Error()})
				continue
			}
		}

		// 2. Upsert bundle
		newStock := 0.0
		if b.Stock != nil {
			newStock = *b.Stock
			if err := shared.ValidateDecimalPrecision(newStock, shared.MaxStockDecimals); err != nil {
				tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
				result.Errors++
				result.Details = append(result.Details, SyncError{Identifier: b.identifier(), Message: err.Error()})
				continue
			}
		}
		err = tx.QueryRow(ctx, `
			INSERT INTO bundles (bundle_id, code, name, status, branch_id, category_id, stock, stock_available, stock_blocked, blocks_product_stock)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $7, 0, $8)
			ON CONFLICT (code, branch_id) DO UPDATE SET
				name = EXCLUDED.name,
				status = EXCLUDED.status,
				category_id = EXCLUDED.category_id,
				stock = EXCLUDED.stock,
				stock_available = EXCLUDED.stock,
				stock_blocked = 0,
				blocks_product_stock = EXCLUDED.blocks_product_stock
			RETURNING bundle_id
		`, uuid.New(), b.Code, b.Name, status, branchID, categoryID, newStock, b.BlocksProductStock).Scan(&bundleID)
		if err != nil {
			tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
			result.Errors++
			result.Details = append(result.Details, SyncError{Identifier: b.identifier(), Message: err.Error()})
			continue
		}

		// 3. Replace bundle items
		if _, err := tx.Exec(ctx, `DELETE FROM bundle_items WHERE bundle_id = $1`, bundleID); err != nil {
			tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
			result.Errors++
			result.Details = append(result.Details, SyncError{Identifier: b.identifier(), Message: err.Error()})
			continue
		}
		newItems := make([]pricing.ChainItem, 0)
		itemsFailed := false
		for _, item := range b.Items {
			if err := shared.ValidateDecimalPrecision(item.Quantity, shared.MaxStockDecimals); err != nil {
				tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
				result.Errors++
				result.Details = append(result.Details, SyncError{Identifier: b.identifier(), Message: err.Error()})
				itemsFailed = true
				break
			}
			productID, err := s.resolveProductID(ctx, tx, item.ProductCode, branchID)
			if err != nil {
				tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
				result.Errors++
				result.Details = append(result.Details, SyncError{Identifier: b.identifier(), Message: err.Error()})
				itemsFailed = true
				break
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO bundle_items (id, bundle_id, product_id, quantity)
				VALUES ($1, $2, $3, $4)
			`, uuid.New(), bundleID, productID, item.Quantity); err != nil {
				tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
				result.Errors++
				result.Details = append(result.Details, SyncError{Identifier: b.identifier(), Message: fmt.Sprintf("item insert: %v", err)})
				itemsFailed = true
				break
			}
			newItems = append(newItems, pricing.ChainItem{ProductID: productID, Quantity: item.Quantity})
		}
		if itemsFailed {
			continue
		}

		// 4. Replace bundle prices (using pre-resolved price category map)
		if _, err := tx.Exec(ctx, `DELETE FROM bundle_prices WHERE bundle_id = $1`, bundleID); err != nil {
			tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
			result.Errors++
			result.Details = append(result.Details, SyncError{Identifier: b.identifier(), Message: err.Error()})
			continue
		}
		priceFailed := false
		for _, p := range b.Prices {
			var pcID *uuid.UUID
			if p.Code != nil {
				if id, ok := priceCatMap[*p.Code]; ok {
					pcID = &id
				}
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO bundle_prices (id, bundle_id, price_category_id, amount)
				VALUES ($1, $2, $3, $4)
			`, uuid.New(), bundleID, pcID, p.Amount); err != nil {
				tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
				result.Errors++
				result.Details = append(result.Details, SyncError{Identifier: b.identifier(), Message: fmt.Sprintf("price insert: %v", err)})
				priceFailed = true
				break
			}
		}
		if priceFailed {
			continue
		}

		// 5. Block new stock if chain enabled
		if b.BlocksProductStock && newStock > 0 {
			maxStock, chainErr := pricing.MaxBundleStock(ctx, tx, newItems)
			if chainErr != nil {
				tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
				result.Errors++
				result.Details = append(result.Details, SyncError{Identifier: b.identifier(), Message: chainErr.Error()})
				continue
			}
			if newStock > maxStock {
				tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
				result.Errors++
				result.Details = append(result.Details, SyncError{Identifier: b.identifier(), Message: fmt.Sprintf("BUNDLE_STOCK_EXCEEDS_CHAIN: max %.4f, requested %.4f", maxStock, newStock)})
				continue
			}
			if blockErr := pricing.BlockProductStock(ctx, tx, newItems, newStock); blockErr != nil {
				tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+sp)
				result.Errors++
				result.Details = append(result.Details, SyncError{Identifier: b.identifier(), Message: blockErr.Error()})
				continue
			}
		}

		tx.Exec(ctx, "RELEASE SAVEPOINT "+sp)
		result.Processed++
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return result, nil
}

// ---------------------------------------------------------------------------
// Image methods (unchanged — used by sync handlers with SKU/code lookup)
// ---------------------------------------------------------------------------

func (s *Service) UpdateProductImage(ctx context.Context, id uuid.UUID, img string) (string, error) {
	var oldImg *string
	err := s.pool.QueryRow(ctx, `SELECT img FROM products WHERE product_id = $1`, id).Scan(&oldImg)
	if err == pgx.ErrNoRows {
		return "", fmt.Errorf("NOT_FOUND")
	}
	if err != nil {
		return "", fmt.Errorf("get product: %w", err)
	}

	var newImg interface{}
	if img != "" {
		newImg = img
	}
	_, err = s.pool.Exec(ctx, `UPDATE products SET img = $2 WHERE product_id = $1`, id, newImg)
	if err != nil {
		return "", fmt.Errorf("update product image: %w", err)
	}

	if oldImg != nil && *oldImg != "" {
		return *oldImg, nil
	}
	return "", nil
}

func (s *Service) UpdateBundleImage(ctx context.Context, id uuid.UUID, img string) (string, error) {
	var oldImg *string
	err := s.pool.QueryRow(ctx, `SELECT img FROM bundles WHERE bundle_id = $1`, id).Scan(&oldImg)
	if err == pgx.ErrNoRows {
		return "", fmt.Errorf("NOT_FOUND")
	}
	if err != nil {
		return "", fmt.Errorf("get bundle: %w", err)
	}

	var newImg interface{}
	if img != "" {
		newImg = img
	}
	_, err = s.pool.Exec(ctx, `UPDATE bundles SET img = $2 WHERE bundle_id = $1`, id, newImg)
	if err != nil {
		return "", fmt.Errorf("update bundle image: %w", err)
	}

	if oldImg != nil && *oldImg != "" {
		return *oldImg, nil
	}
	return "", nil
}

func (s *Service) UpdateProductImageBySKU(ctx context.Context, sku string, img string) (string, error) {
	var oldImg *string
	err := s.pool.QueryRow(ctx, `SELECT img FROM products WHERE sku = $1`, sku).Scan(&oldImg)
	if err == pgx.ErrNoRows {
		return "", fmt.Errorf("NOT_FOUND")
	}
	if err != nil {
		return "", fmt.Errorf("get product: %w", err)
	}

	var newImg interface{}
	if img != "" {
		newImg = img
	}
	_, err = s.pool.Exec(ctx, `UPDATE products SET img = $2 WHERE sku = $1`, sku, newImg)
	if err != nil {
		return "", fmt.Errorf("update product image: %w", err)
	}

	if oldImg != nil && *oldImg != "" {
		return *oldImg, nil
	}
	return "", nil
}

func (s *Service) UpdateBundleImageByCode(ctx context.Context, code string, img string) (string, error) {
	var oldImg *string
	err := s.pool.QueryRow(ctx, `SELECT img FROM bundles WHERE code = $1`, code).Scan(&oldImg)
	if err == pgx.ErrNoRows {
		return "", fmt.Errorf("NOT_FOUND")
	}
	if err != nil {
		return "", fmt.Errorf("get bundle: %w", err)
	}

	var newImg interface{}
	if img != "" {
		newImg = img
	}
	_, err = s.pool.Exec(ctx, `UPDATE bundles SET img = $2 WHERE code = $1`, code, newImg)
	if err != nil {
		return "", fmt.Errorf("update bundle image: %w", err)
	}

	if oldImg != nil && *oldImg != "" {
		return *oldImg, nil
	}
	return "", nil
}
