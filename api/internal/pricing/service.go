package pricing

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("NOT_FOUND")

type SystemConfigReader interface {
	GetNegativeStock(ctx context.Context) (bool, error)
}

type Service struct {
	pool       *pgxpool.Pool
	sysCfg     SystemConfigReader
}

func NewService(pool *pgxpool.Pool, sysCfg SystemConfigReader) *Service {
	return &Service{pool: pool, sysCfg: sysCfg}
}

// Product

type BranchInfo struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	Code string    `json:"code"`
}

type Product struct {
	ProductID      uuid.UUID  `json:"product_id"`
	Name           string     `json:"name"`
	Sku            string     `json:"sku"`
	IsActive       bool       `json:"is_active"`
	Img            *string    `json:"img"`
	BrandID        uuid.UUID  `json:"brand_id"`
	CategoryID     *uuid.UUID `json:"category_id"`
	BranchID       *uuid.UUID `json:"branch_id"`
	Branch         *BranchInfo `json:"branch"`
	BaseUnitID     *uuid.UUID `json:"base_unit_id"`
	Stock          float64    `json:"stock"`
	StockAvailable float64    `json:"stock_available"`
	StockBlocked   float64    `json:"stock_blocked"`
}

type CreateProductRequest struct {
	Name           string     `json:"name" validate:"required"`
	Sku            string     `json:"sku" validate:"required"`
	Img            *string    `json:"img"`
	BrandID        uuid.UUID  `json:"brand_id" validate:"required"`
	CategoryID     *uuid.UUID `json:"category_id"`
	BranchID       *uuid.UUID `json:"branch_id"`
	BaseUnitID     *uuid.UUID `json:"base_unit_id"`
	Stock          *float64   `json:"stock"`
	StockAvailable *float64   `json:"stock_available"`
	StockBlocked   *float64   `json:"stock_blocked"`
}

func (s *Service) CreateProduct(ctx context.Context, req CreateProductRequest) (*Product, error) {
	p := &Product{}
	err := s.pool.QueryRow(ctx, `
		INSERT INTO products (product_id, name, sku, is_active, img, brand_id, category_id, branch_id, base_unit_id, stock, stock_available, stock_blocked)
		VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, COALESCE($9, 0), COALESCE($9, 0), 0)
		RETURNING product_id, name, sku, is_active, img, brand_id, category_id, branch_id, base_unit_id, stock, stock_available, stock_blocked
	`, uuid.New(), req.Name, req.Sku, req.Img, req.BrandID, req.CategoryID, req.BranchID, req.BaseUnitID, req.Stock).Scan(
		&p.ProductID, &p.Name, &p.Sku, &p.IsActive, &p.Img, &p.BrandID, &p.CategoryID, &p.BranchID, &p.BaseUnitID, &p.Stock, &p.StockAvailable, &p.StockBlocked,
	)
	if err != nil {
		return nil, fmt.Errorf("create product: %w", err)
	}
	return p, nil
}

func (s *Service) GetProductByID(ctx context.Context, id uuid.UUID) (*Product, error) {
	p := &Product{}
	err := s.pool.QueryRow(ctx, `
		SELECT product_id, name, sku, is_active, img, brand_id, category_id, branch_id, base_unit_id, stock, stock_available, stock_blocked
		FROM products WHERE product_id = $1
	`, id).Scan(&p.ProductID, &p.Name, &p.Sku, &p.IsActive, &p.Img, &p.BrandID, &p.CategoryID, &p.BranchID, &p.BaseUnitID, &p.Stock, &p.StockAvailable, &p.StockBlocked)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get product: %w", err)
	}
	return p, nil
}

func (s *Service) ListProducts(ctx context.Context, filter ...ProductFilter) ([]Product, int, error) {
	var f ProductFilter
	if len(filter) > 0 {
		f = filter[0]
	}

	countQuery := `SELECT COUNT(*) FROM products WHERE 1=1`
	dataQuery := `SELECT p.product_id, p.name, p.sku, p.is_active, p.img, p.brand_id, p.category_id, p.branch_id,
		COALESCE(b.store_name, '') AS branch_name,
		COALESCE(b.code, '') AS branch_code,
		p.base_unit_id, p.stock, p.stock_available, p.stock_blocked
	FROM products p
	LEFT JOIN branches b ON b.id = p.branch_id
	WHERE 1=1`
	var args []interface{}
	argIdx := 1

	if f.CategoryID != nil {
		countQuery += fmt.Sprintf(` AND category_id = $%d`, argIdx)
		dataQuery += fmt.Sprintf(` AND p.category_id = $%d`, argIdx)
		args = append(args, *f.CategoryID)
		argIdx++
	}
	if f.Name != nil {
		countQuery += fmt.Sprintf(` AND name ILIKE '%%' || $%d || '%%'`, argIdx)
		dataQuery += fmt.Sprintf(` AND p.name ILIKE '%%' || $%d || '%%'`, argIdx)
		args = append(args, *f.Name)
		argIdx++
	}
	if f.Sku != nil {
		countQuery += fmt.Sprintf(` AND sku = $%d`, argIdx)
		dataQuery += fmt.Sprintf(` AND p.sku = $%d`, argIdx)
		args = append(args, *f.Sku)
		argIdx++
	}
	if f.IsActive != nil {
		countQuery += fmt.Sprintf(` AND is_active = $%d`, argIdx)
		dataQuery += fmt.Sprintf(` AND p.is_active = $%d`, argIdx)
		args = append(args, *f.IsActive)
		argIdx++
	}
	if f.BranchID != nil {
		countQuery += fmt.Sprintf(` AND branch_id = $%d`, argIdx)
		dataQuery += fmt.Sprintf(` AND p.branch_id = $%d`, argIdx)
		args = append(args, *f.BranchID)
		argIdx++
	}

	var totalCount int
	if err := s.pool.QueryRow(ctx, countQuery, args...).Scan(&totalCount); err != nil {
		return nil, 0, fmt.Errorf("count products: %w", err)
	}

	dataQuery += ` ORDER BY p.name`

	if len(filter) > 0 {
		limit := f.GetLimit()
		offset := f.GetOffset()
		dataQuery += fmt.Sprintf(` LIMIT $%d OFFSET $%d`, argIdx, argIdx+1)
		args = append(args, limit, offset)
	}

	rows, err := s.pool.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list products: %w", err)
	}
	defer rows.Close()

	products := make([]Product, 0)
	for rows.Next() {
		var p Product
		var branchName, branchCode string
		if err := rows.Scan(&p.ProductID, &p.Name, &p.Sku, &p.IsActive, &p.Img, &p.BrandID, &p.CategoryID, &p.BranchID,
			&branchName, &branchCode, &p.BaseUnitID, &p.Stock, &p.StockAvailable, &p.StockBlocked); err != nil {
			return nil, 0, fmt.Errorf("scan product: %w", err)
		}
		if p.BranchID != nil {
			p.Branch = &BranchInfo{ID: *p.BranchID, Name: branchName, Code: branchCode}
		}
		products = append(products, p)
	}
	return products, totalCount, nil
}

func (s *Service) UpdateProduct(ctx context.Context, id uuid.UUID, req CreateProductRequest) (*Product, error) {
	var current Product
	err := s.pool.QueryRow(ctx, `
		SELECT product_id, name, sku, is_active, img, brand_id, category_id, branch_id, base_unit_id, stock, stock_available, stock_blocked
		FROM products WHERE product_id = $1 FOR UPDATE
	`, id).Scan(
		&current.ProductID, &current.Name, &current.Sku, &current.IsActive, &current.Img,
		&current.BrandID, &current.CategoryID, &current.BranchID, &current.BaseUnitID,
		&current.Stock, &current.StockAvailable, &current.StockBlocked,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get product for update: %w", err)
	}

	img := current.Img
	if req.Img != nil {
		img = req.Img
	}

	categoryID := current.CategoryID
	if req.CategoryID != nil {
		categoryID = req.CategoryID
	}

	branchID := current.BranchID
	if req.BranchID != nil {
		branchID = req.BranchID
	}

	baseUnitID := current.BaseUnitID
	if req.BaseUnitID != nil {
		baseUnitID = req.BaseUnitID
	}

	newStock := current.Stock
	newStockAvail := current.StockAvailable
	newStockBlocked := current.StockBlocked

	if req.Stock != nil {
		newStock = *req.Stock
		delta := newStock - current.Stock
		newStockAvail = current.StockAvailable + delta

		negativeStock, _ := s.sysCfg.GetNegativeStock(ctx)

		if newStock < 0 && !negativeStock {
			return nil, fmt.Errorf("STOCK_BELOW_ZERO")
		}
		if newStockAvail < 0 && !negativeStock {
			return nil, fmt.Errorf("STOCK_AVAILABLE_BELOW_ZERO")
		}
		if current.StockBlocked > newStock {
			return nil, fmt.Errorf("STOCK_BLOCKED_EXCEEDS_STOCK")
		}
	}

	p := &Product{}
	err = s.pool.QueryRow(ctx, `
		UPDATE products SET name = $2, sku = $3, img = $4, brand_id = $5, category_id = $6, branch_id = $7, base_unit_id = $8, stock = $9, stock_available = $10, stock_blocked = $11
		WHERE product_id = $1
		RETURNING product_id, name, sku, is_active, img, brand_id, category_id, branch_id, base_unit_id, stock, stock_available, stock_blocked
	`, id, req.Name, req.Sku, img, req.BrandID, categoryID, branchID, baseUnitID, newStock, newStockAvail, newStockBlocked).Scan(
		&p.ProductID, &p.Name, &p.Sku, &p.IsActive, &p.Img, &p.BrandID, &p.CategoryID, &p.BranchID, &p.BaseUnitID, &p.Stock, &p.StockAvailable, &p.StockBlocked,
	)
	if err != nil {
		return nil, fmt.Errorf("update product: %w", err)
	}
	return p, nil
}

func (s *Service) DeleteProduct(ctx context.Context, id uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM products WHERE product_id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete product: %w", err)
	}
	return nil
}

func (s *Service) ToggleProductActive(ctx context.Context, id uuid.UUID) (*Product, error) {
	p := &Product{}
	err := s.pool.QueryRow(ctx, `
		UPDATE products SET is_active = NOT is_active
		WHERE product_id = $1
		RETURNING product_id, name, sku, is_active, img, brand_id, category_id, branch_id, base_unit_id, stock, stock_available, stock_blocked
	`, id).Scan(&p.ProductID, &p.Name, &p.Sku, &p.IsActive, &p.Img, &p.BrandID, &p.CategoryID, &p.BranchID, &p.BaseUnitID, &p.Stock, &p.StockAvailable, &p.StockBlocked)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("toggle product active: %w", err)
	}
	return p, nil
}

func (s *Service) UpdateProductImage(ctx context.Context, id uuid.UUID, img string) (string, error) {
	var oldImg *string
	err := s.pool.QueryRow(ctx, `SELECT img FROM products WHERE product_id = $1`, id).Scan(&oldImg)
	if err == pgx.ErrNoRows {
		return "", ErrNotFound
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

// Bundle

type Bundle struct {
	BundleID           uuid.UUID     `json:"bundle_id"`
	Code               string        `json:"code"`
	Name               string        `json:"name"`
	Status             string        `json:"status"`
	BranchID           *uuid.UUID    `json:"branch_id"`
	Branch             *BranchInfo   `json:"branch"`
	Items              []BundleItem  `json:"items"`
	Prices             []BundlePrice `json:"prices"`
	Img                *string       `json:"img"`
	CategoryID         *uuid.UUID    `json:"category_id"`
	Stock              float64       `json:"stock"`
	StockAvailable     float64       `json:"stock_available"`
	StockBlocked       float64       `json:"stock_blocked"`
	BlocksProductStock bool          `json:"blocks_product_stock"`
}

type BundlePrice struct {
	ID              uuid.UUID  `json:"id"`
	BundleID        uuid.UUID  `json:"bundle_id"`
	PriceCategoryID *uuid.UUID `json:"price_category_id"`
	Amount          float64    `json:"amount"`
}

type BundleItem struct {
	ID        uuid.UUID `json:"id"`
	BundleID  uuid.UUID `json:"bundle_id"`
	ProductID uuid.UUID `json:"product_id"`
	Quantity  float64   `json:"quantity"`
}

type CreateBundleRequest struct {
	Code               string           `json:"code" validate:"required"`
	Name               string           `json:"name" validate:"required"`
	Items              []BundleItemReq  `json:"items" validate:"required"`
	Prices             []BundlePriceReq `json:"prices"`
	BranchID           *uuid.UUID       `json:"branch_id"`
	Img                *string          `json:"img"`
	CategoryID         *uuid.UUID       `json:"category_id"`
	Stock              *float64         `json:"stock"`
	StockAvailable     *float64         `json:"stock_available"`
	StockBlocked       *float64         `json:"stock_blocked"`
	BlocksProductStock *bool            `json:"blocks_product_stock"`
}

type BundleItemReq struct {
	ProductID uuid.UUID `json:"product_id" validate:"required"`
	Quantity  float64   `json:"quantity" validate:"required,gt=0"`
}

type BundlePriceReq struct {
	PriceCategoryID *uuid.UUID `json:"price_category_id"`
	Amount          float64    `json:"amount" validate:"required"`
}

func (s *Service) validateProductsExist(ctx context.Context, items []BundleItemReq) error {
	if len(items) == 0 {
		return nil
	}

	seen := make(map[uuid.UUID]bool)
	ids := make([]uuid.UUID, 0, len(items))
	for _, item := range items {
		if !seen[item.ProductID] {
			seen[item.ProductID] = true
			ids = append(ids, item.ProductID)
		}
	}

	rows, err := s.pool.Query(ctx, `SELECT product_id FROM products WHERE product_id = ANY($1)`, ids)
	if err != nil {
		return fmt.Errorf("validate products: %w", err)
	}
	defer rows.Close()

	existing := make(map[uuid.UUID]bool)
	for rows.Next() {
		var pid uuid.UUID
		if err := rows.Scan(&pid); err != nil {
			return fmt.Errorf("scan product id: %w", err)
		}
		existing[pid] = true
	}

	var missing []string
	for _, id := range ids {
		if !existing[id] {
			missing = append(missing, id.String())
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("PRODUCT_NOT_FOUND: %s", strings.Join(missing, ", "))
	}
	return nil
}

func (s *Service) CreateBundle(ctx context.Context, req CreateBundleRequest) (*Bundle, error) {
	if err := s.validateProductsExist(ctx, req.Items); err != nil {
		return nil, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	blocksProductStock := req.BlocksProductStock != nil && *req.BlocksProductStock

	bundle := &Bundle{}
	err = tx.QueryRow(ctx, `
		INSERT INTO bundles (bundle_id, code, name, status, branch_id, img, category_id, stock, stock_available, stock_blocked, blocks_product_stock)
		VALUES ($1, $2, $3, 'Active', $4, $5, $6, COALESCE($7, 0), COALESCE($8, $7, 0), COALESCE($9, 0), $10)
		RETURNING bundle_id, code, name, status, branch_id, img, category_id, stock, stock_available, stock_blocked, blocks_product_stock
	`, uuid.New(), req.Code, req.Name, req.BranchID, req.Img, req.CategoryID, req.Stock, req.StockAvailable, req.StockBlocked, blocksProductStock).Scan(
		&bundle.BundleID, &bundle.Code, &bundle.Name, &bundle.Status, &bundle.BranchID,
		&bundle.Img, &bundle.CategoryID, &bundle.Stock, &bundle.StockAvailable, &bundle.StockBlocked, &bundle.BlocksProductStock,
	)
	if err != nil {
		return nil, fmt.Errorf("create bundle: %w", err)
	}

	for _, item := range req.Items {
		var bi BundleItem
		err = tx.QueryRow(ctx, `
			INSERT INTO bundle_items (id, bundle_id, product_id, quantity)
			VALUES ($1, $2, $3, $4)
			RETURNING id, bundle_id, product_id, quantity
		`, uuid.New(), bundle.BundleID, item.ProductID, item.Quantity).Scan(
			&bi.ID, &bi.BundleID, &bi.ProductID, &bi.Quantity,
		)
		if err != nil {
			return nil, fmt.Errorf("create bundle item: %w", err)
		}
		bundle.Items = append(bundle.Items, bi)
	}

	bundle.Prices = []BundlePrice{}

	for _, p := range req.Prices {
		if p.Amount <= 0 {
			continue
		}
		var bp BundlePrice
		err = tx.QueryRow(ctx, `
			INSERT INTO bundle_prices (id, bundle_id, price_category_id, amount)
			VALUES ($1, $2, $3, $4)
			RETURNING id, bundle_id, price_category_id, amount
		`, uuid.New(), bundle.BundleID, p.PriceCategoryID, p.Amount).Scan(
			&bp.ID, &bp.BundleID, &bp.PriceCategoryID, &bp.Amount,
		)
		if err != nil {
			return nil, fmt.Errorf("create bundle price: %w", err)
		}
		bundle.Prices = append(bundle.Prices, bp)
	}

	if blocksProductStock && bundle.Stock > 0 {
		maxStock, err := MaxBundleStock(ctx, tx, toChainItems(bundle.Items))
		if err != nil {
			return nil, err
		}
		if bundle.Stock > maxStock {
			return nil, fmt.Errorf("BUNDLE_STOCK_EXCEEDS_CHAIN: max %.4f, requested %.4f", maxStock, bundle.Stock)
		}
		if err := BlockProductStock(ctx, tx, toChainItems(bundle.Items), bundle.Stock); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return bundle, nil
}

func (s *Service) GetBundleByID(ctx context.Context, id uuid.UUID) (*Bundle, error) {
	bundle := &Bundle{}
	err := s.pool.QueryRow(ctx, `
		SELECT bundle_id, code, name, status, branch_id, img, category_id, stock, stock_available, stock_blocked, blocks_product_stock
		FROM bundles WHERE bundle_id = $1
	`, id).Scan(
		&bundle.BundleID, &bundle.Code, &bundle.Name, &bundle.Status, &bundle.BranchID,
		&bundle.Img, &bundle.CategoryID, &bundle.Stock, &bundle.StockAvailable, &bundle.StockBlocked, &bundle.BlocksProductStock,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get bundle: %w", err)
	}

	// Load items
	itemRows, err := s.pool.Query(ctx, `SELECT id, bundle_id, product_id, quantity FROM bundle_items WHERE bundle_id = $1`, id)
	if err != nil {
		return nil, fmt.Errorf("get bundle items: %w", err)
	}
	defer itemRows.Close()

	for itemRows.Next() {
		var bi BundleItem
		if err := itemRows.Scan(&bi.ID, &bi.BundleID, &bi.ProductID, &bi.Quantity); err != nil {
			return nil, fmt.Errorf("scan bundle item: %w", err)
		}
		bundle.Items = append(bundle.Items, bi)
	}

	// Load prices
	priceRows, err := s.pool.Query(ctx, `SELECT id, bundle_id, price_category_id, amount FROM bundle_prices WHERE bundle_id = $1`, id)
	if err != nil {
		return nil, fmt.Errorf("get bundle prices: %w", err)
	}
	defer priceRows.Close()

	for priceRows.Next() {
		var bp BundlePrice
		if err := priceRows.Scan(&bp.ID, &bp.BundleID, &bp.PriceCategoryID, &bp.Amount); err != nil {
			return nil, fmt.Errorf("scan bundle price: %w", err)
		}
		bundle.Prices = append(bundle.Prices, bp)
	}

	return bundle, nil
}

func (s *Service) ListBundles(ctx context.Context, filter ...BundleFilter) ([]Bundle, int, error) {
	var f BundleFilter
	if len(filter) > 0 {
		f = filter[0]
	}

	countQuery := `SELECT COUNT(*) FROM bundles WHERE 1=1`
	dataQuery := `SELECT bu.bundle_id, bu.code, bu.name, bu.status, bu.branch_id,
		COALESCE(b.store_name, '') AS branch_name,
		COALESCE(b.code, '') AS branch_code,
		bu.img, bu.category_id, bu.stock, bu.stock_available, bu.stock_blocked, bu.blocks_product_stock
	FROM bundles bu
	LEFT JOIN branches b ON b.id = bu.branch_id
	WHERE 1=1`
	var args []interface{}
	argIdx := 1

	if f.CategoryID != nil {
		countQuery += fmt.Sprintf(` AND category_id = $%d`, argIdx)
		dataQuery += fmt.Sprintf(` AND bu.category_id = $%d`, argIdx)
		args = append(args, *f.CategoryID)
		argIdx++
	}
	if f.Name != nil {
		countQuery += fmt.Sprintf(` AND name ILIKE '%%' || $%d || '%%'`, argIdx)
		dataQuery += fmt.Sprintf(` AND bu.name ILIKE '%%' || $%d || '%%'`, argIdx)
		args = append(args, *f.Name)
		argIdx++
	}
	if f.Code != nil {
		countQuery += fmt.Sprintf(` AND code = $%d`, argIdx)
		dataQuery += fmt.Sprintf(` AND bu.code = $%d`, argIdx)
		args = append(args, *f.Code)
		argIdx++
	}
	if f.Status != nil {
		countQuery += fmt.Sprintf(` AND status = $%d`, argIdx)
		dataQuery += fmt.Sprintf(` AND bu.status = $%d`, argIdx)
		args = append(args, *f.Status)
		argIdx++
	}
	if f.BranchID != nil {
		countQuery += fmt.Sprintf(` AND branch_id = $%d`, argIdx)
		dataQuery += fmt.Sprintf(` AND bu.branch_id = $%d`, argIdx)
		args = append(args, *f.BranchID)
		argIdx++
	}

	var totalCount int
	if err := s.pool.QueryRow(ctx, countQuery, args...).Scan(&totalCount); err != nil {
		return nil, 0, fmt.Errorf("count bundles: %w", err)
	}

	dataQuery += ` ORDER BY bu.name`

	if len(filter) > 0 {
		limit := f.GetLimit()
		offset := f.GetOffset()
		dataQuery += fmt.Sprintf(` LIMIT $%d OFFSET $%d`, argIdx, argIdx+1)
		args = append(args, limit, offset)
	}

	rows, err := s.pool.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list bundles: %w", err)
	}
	defer rows.Close()

	bundles := make([]Bundle, 0)
	for rows.Next() {
		var b Bundle
		var branchName, branchCode string
		if err := rows.Scan(&b.BundleID, &b.Code, &b.Name, &b.Status, &b.BranchID,
			&branchName, &branchCode,
			&b.Img, &b.CategoryID, &b.Stock, &b.StockAvailable, &b.StockBlocked, &b.BlocksProductStock); err != nil {
			return nil, 0, fmt.Errorf("scan bundle: %w", err)
		}
		if b.BranchID != nil {
			b.Branch = &BranchInfo{ID: *b.BranchID, Name: branchName, Code: branchCode}
		}
		bundles = append(bundles, b)
	}

	if len(bundles) > 0 {
		ids := make([]uuid.UUID, len(bundles))
		for i, b := range bundles {
			ids[i] = b.BundleID
		}

		itemRows, err := s.pool.Query(ctx, `SELECT id, bundle_id, product_id, quantity FROM bundle_items WHERE bundle_id = ANY($1)`, ids)
		if err != nil {
			return nil, 0, fmt.Errorf("list bundle items: %w", err)
		}
		defer itemRows.Close()

		itemMap := make(map[uuid.UUID][]BundleItem)
		for itemRows.Next() {
			var bi BundleItem
			if err := itemRows.Scan(&bi.ID, &bi.BundleID, &bi.ProductID, &bi.Quantity); err != nil {
				return nil, 0, fmt.Errorf("scan bundle item: %w", err)
			}
			itemMap[bi.BundleID] = append(itemMap[bi.BundleID], bi)
		}

		priceRows, err := s.pool.Query(ctx, `SELECT id, bundle_id, price_category_id, amount FROM bundle_prices WHERE bundle_id = ANY($1)`, ids)
		if err != nil {
			return nil, 0, fmt.Errorf("list bundle prices: %w", err)
		}
		defer priceRows.Close()

		priceMap := make(map[uuid.UUID][]BundlePrice)
		for priceRows.Next() {
			var bp BundlePrice
			if err := priceRows.Scan(&bp.ID, &bp.BundleID, &bp.PriceCategoryID, &bp.Amount); err != nil {
				return nil, 0, fmt.Errorf("scan bundle price: %w", err)
			}
			priceMap[bp.BundleID] = append(priceMap[bp.BundleID], bp)
		}

		for i, b := range bundles {
			bundles[i].Items = itemMap[b.BundleID]
			bundles[i].Prices = priceMap[b.BundleID]
		}
	}

	return bundles, totalCount, nil
}

func (s *Service) UpdateBundle(ctx context.Context, id uuid.UUID, req CreateBundleRequest) (*Bundle, error) {
	if err := s.validateProductsExist(ctx, req.Items); err != nil {
		return nil, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// 1. Load current bundle + items FOR UPDATE
	oldBundle := &Bundle{}
	err = tx.QueryRow(ctx, `
		SELECT bundle_id, stock, blocks_product_stock
		FROM bundles WHERE bundle_id = $1 FOR UPDATE
	`, id).Scan(&oldBundle.BundleID, &oldBundle.Stock, &oldBundle.BlocksProductStock)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get bundle for update: %w", err)
	}

	oldItems := make([]BundleItem, 0)
	oldItemRows, err := tx.Query(ctx, `SELECT id, bundle_id, product_id, quantity FROM bundle_items WHERE bundle_id = $1`, id)
	if err != nil {
		return nil, fmt.Errorf("get old items: %w", err)
	}
	for oldItemRows.Next() {
		var bi BundleItem
		if err := oldItemRows.Scan(&bi.ID, &bi.BundleID, &bi.ProductID, &bi.Quantity); err != nil {
			oldItemRows.Close()
			return nil, fmt.Errorf("scan old item: %w", err)
		}
		oldItems = append(oldItems, bi)
	}
	oldItemRows.Close()

	// 2. Release old blocked stock if old.blocks_product_stock was enabled
	if oldBundle.BlocksProductStock && oldBundle.Stock > 0 {
		if err := ReleaseProductStock(ctx, tx, toChainItems(oldItems), oldBundle.Stock); err != nil {
			return nil, err
		}
	}

	// 3. Update bundle row
	blocksProductStock := req.BlocksProductStock != nil && *req.BlocksProductStock
	bundle := &Bundle{}
	err = tx.QueryRow(ctx, `
		UPDATE bundles SET code = $2, name = $3, branch_id = $4, img = $5, category_id = $6,
			stock = COALESCE($7, 0), stock_available = COALESCE($8, $7, 0), stock_blocked = COALESCE($9, 0), blocks_product_stock = $10
		WHERE bundle_id = $1
		RETURNING bundle_id, code, name, status, branch_id, img, category_id, stock, stock_available, stock_blocked, blocks_product_stock
	`, id, req.Code, req.Name, req.BranchID, req.Img, req.CategoryID,
		req.Stock, req.StockAvailable, req.StockBlocked, blocksProductStock).Scan(
		&bundle.BundleID, &bundle.Code, &bundle.Name, &bundle.Status, &bundle.BranchID,
		&bundle.Img, &bundle.CategoryID, &bundle.Stock, &bundle.StockAvailable, &bundle.StockBlocked, &bundle.BlocksProductStock,
	)
	if err != nil {
		return nil, fmt.Errorf("update bundle: %w", err)
	}

	// 4. Replace items
	tx.Exec(ctx, `DELETE FROM bundle_items WHERE bundle_id = $1`, id)

	for _, item := range req.Items {
		var bi BundleItem
		err = tx.QueryRow(ctx, `
			INSERT INTO bundle_items (id, bundle_id, product_id, quantity)
			VALUES ($1, $2, $3, $4)
			RETURNING id, bundle_id, product_id, quantity
		`, uuid.New(), bundle.BundleID, item.ProductID, item.Quantity).Scan(
			&bi.ID, &bi.BundleID, &bi.ProductID, &bi.Quantity,
		)
		if err != nil {
			return nil, fmt.Errorf("create bundle item: %w", err)
		}
		bundle.Items = append(bundle.Items, bi)
	}

	// 5. Block new stock if new.blocks_product_stock is enabled
	if blocksProductStock && bundle.Stock > 0 {
		maxStock, err := MaxBundleStock(ctx, tx, toChainItems(bundle.Items))
		if err != nil {
			return nil, err
		}
		if bundle.Stock > maxStock {
			return nil, fmt.Errorf("BUNDLE_STOCK_EXCEEDS_CHAIN: max %.4f, requested %.4f", maxStock, bundle.Stock)
		}
		if err := BlockProductStock(ctx, tx, toChainItems(bundle.Items), bundle.Stock); err != nil {
			return nil, err
		}
	}

	bundle.Prices = []BundlePrice{}

	// 6. Replace prices
	_, err = tx.Exec(ctx, `DELETE FROM bundle_prices WHERE bundle_id = $1`, id)
	if err != nil {
		return nil, fmt.Errorf("delete old prices: %w", err)
	}

	for _, p := range req.Prices {
		if p.Amount <= 0 {
			continue
		}
		var bp BundlePrice
		err = tx.QueryRow(ctx, `
			INSERT INTO bundle_prices (id, bundle_id, price_category_id, amount)
			VALUES ($1, $2, $3, $4)
			RETURNING id, bundle_id, price_category_id, amount
		`, uuid.New(), bundle.BundleID, p.PriceCategoryID, p.Amount).Scan(
			&bp.ID, &bp.BundleID, &bp.PriceCategoryID, &bp.Amount,
		)
		if err != nil {
			return nil, fmt.Errorf("create bundle price: %w", err)
		}
		bundle.Prices = append(bundle.Prices, bp)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return bundle, nil
}

func (s *Service) DeleteBundle(ctx context.Context, id uuid.UUID) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var stock float64
	var blocksProductStock bool
	err = tx.QueryRow(ctx, `
		SELECT stock, blocks_product_stock FROM bundles WHERE bundle_id = $1 FOR UPDATE
	`, id).Scan(&stock, &blocksProductStock)
	if err == pgx.ErrNoRows {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("get bundle: %w", err)
	}

	if blocksProductStock && stock > 0 {
		items := make([]BundleItem, 0)
		rows, err := tx.Query(ctx, `SELECT id, bundle_id, product_id, quantity FROM bundle_items WHERE bundle_id = $1`, id)
		if err != nil {
			return fmt.Errorf("get items: %w", err)
		}
		for rows.Next() {
			var bi BundleItem
			if err := rows.Scan(&bi.ID, &bi.BundleID, &bi.ProductID, &bi.Quantity); err != nil {
				rows.Close()
				return fmt.Errorf("scan item: %w", err)
			}
			items = append(items, bi)
		}
		rows.Close()

		if err := ReleaseProductStock(ctx, tx, toChainItems(items), stock); err != nil {
			return err
		}
	}

	_, err = tx.Exec(ctx, `DELETE FROM bundles WHERE bundle_id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete bundle: %w", err)
	}

	return tx.Commit(ctx)
}

func (s *Service) UpdateBundleImage(ctx context.Context, id uuid.UUID, img string) (string, error) {
	var oldImg *string
	err := s.pool.QueryRow(ctx, `SELECT img FROM bundles WHERE bundle_id = $1`, id).Scan(&oldImg)
	if err == pgx.ErrNoRows {
		return "", ErrNotFound
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

func (s *Service) ToggleBundleActive(ctx context.Context, id uuid.UUID) (*Bundle, error) {
	b := &Bundle{}
	err := s.pool.QueryRow(ctx, `
		UPDATE bundles SET status = CASE WHEN status = 'Active' THEN 'Inactive' ELSE 'Active' END
		WHERE bundle_id = $1
		RETURNING bundle_id, code, name, status, branch_id, img, category_id, stock, stock_available, stock_blocked, blocks_product_stock
	`, id).Scan(
		&b.BundleID, &b.Code, &b.Name, &b.Status, &b.BranchID,
		&b.Img, &b.CategoryID, &b.Stock, &b.StockAvailable, &b.StockBlocked, &b.BlocksProductStock,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("toggle bundle active: %w", err)
	}
	return b, nil
}

// Bundle chain helpers — moved to chain.go
// toChainItems converts []BundleItem to []ChainItem for use with the shared helpers.
// Bundle Price

type CreateBundlePriceRequest struct {
	BundleID        uuid.UUID  `json:"bundle_id"`
	PriceCategoryID *uuid.UUID `json:"price_category_id"`
	Amount          float64    `json:"amount" validate:"required"`
}

func (s *Service) ListBundlePrices(ctx context.Context, bundleID uuid.UUID) ([]BundlePrice, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, bundle_id, price_category_id, amount
		FROM bundle_prices WHERE bundle_id = $1
	`, bundleID)
	if err != nil {
		return nil, fmt.Errorf("list bundle prices: %w", err)
	}
	defer rows.Close()

	prices := make([]BundlePrice, 0)
	for rows.Next() {
		var bp BundlePrice
		if err := rows.Scan(&bp.ID, &bp.BundleID, &bp.PriceCategoryID, &bp.Amount); err != nil {
			return nil, fmt.Errorf("scan bundle price: %w", err)
		}
		prices = append(prices, bp)
	}
	return prices, nil
}

func (s *Service) CreateBundlePrice(ctx context.Context, req CreateBundlePriceRequest) (*BundlePrice, error) {
	bp := &BundlePrice{}
	err := s.pool.QueryRow(ctx, `
		INSERT INTO bundle_prices (id, bundle_id, price_category_id, amount)
		VALUES ($1, $2, $3, $4)
		RETURNING id, bundle_id, price_category_id, amount
	`, uuid.New(), req.BundleID, req.PriceCategoryID, req.Amount).Scan(
		&bp.ID, &bp.BundleID, &bp.PriceCategoryID, &bp.Amount,
	)
	if err != nil {
		return nil, fmt.Errorf("create bundle price: %w", err)
	}
	return bp, nil
}

func (s *Service) UpdateBundlePrice(ctx context.Context, priceID uuid.UUID, bundleID uuid.UUID, req CreateBundlePriceRequest) (*BundlePrice, error) {
	bp := &BundlePrice{}
	err := s.pool.QueryRow(ctx, `
		UPDATE bundle_prices SET price_category_id = $2, amount = $3
		WHERE id = $1 AND bundle_id = $4
		RETURNING id, bundle_id, price_category_id, amount
	`, priceID, req.PriceCategoryID, req.Amount, bundleID).Scan(
		&bp.ID, &bp.BundleID, &bp.PriceCategoryID, &bp.Amount,
	)
	if err != nil {
		return nil, fmt.Errorf("update bundle price: %w", err)
	}
	return bp, nil
}

func (s *Service) DeleteBundlePrice(ctx context.Context, priceID uuid.UUID, bundleID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM bundle_prices WHERE id = $1 AND bundle_id = $2`, priceID, bundleID)
	if err != nil {
		return fmt.Errorf("delete bundle price: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Conversion Factor

type ConversionFactor struct {
	ID         uuid.UUID `json:"id"`
	ProductID  uuid.UUID `json:"product_id"`
	FromUnitID uuid.UUID `json:"from_unit_id"`
	ToUnitID   uuid.UUID `json:"to_unit_id"`
	Amount     float64   `json:"amount"`
	Main       bool      `json:"main"`
}

type CreateConversionFactorRequest struct {
	ProductID  uuid.UUID `json:"product_id" validate:"required"`
	FromUnitID uuid.UUID `json:"from_unit_id" validate:"required"`
	ToUnitID   uuid.UUID `json:"to_unit_id" validate:"required"`
	Amount     float64   `json:"amount" validate:"required,gt=0"`
	Main       *bool     `json:"main"`
}

func (s *Service) CreateConversionFactor(ctx context.Context, req CreateConversionFactorRequest) (*ConversionFactor, error) {
	if req.FromUnitID == req.ToUnitID {
		return nil, fmt.Errorf("from_unit_id and to_unit_id must be different")
	}

	var count int
	err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM conversion_factors 
		WHERE product_id = $1 AND (
			(from_unit_id = $2 AND to_unit_id = $3)
			OR (from_unit_id = $3 AND to_unit_id = $2)
		)
	`, req.ProductID, req.FromUnitID, req.ToUnitID).Scan(&count)
	if err != nil {
		return nil, fmt.Errorf("check duplicate: %w", err)
	}
	if count > 0 {
		return nil, fmt.Errorf("a conversion factor between these units already exists for this product")
	}

	main := false
	if req.Main != nil {
		main = *req.Main
	}

	if main {
		if _, err := s.pool.Exec(ctx, `UPDATE conversion_factors SET main = false WHERE product_id = $1 AND main = true`, req.ProductID); err != nil {
			return nil, fmt.Errorf("unset existing main: %w", err)
		}
	}

	cf := &ConversionFactor{}
	err = s.pool.QueryRow(ctx, `
		INSERT INTO conversion_factors (id, product_id, from_unit_id, to_unit_id, amount, main)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, product_id, from_unit_id, to_unit_id, amount, main
	`, uuid.New(), req.ProductID, req.FromUnitID, req.ToUnitID, req.Amount, main).Scan(
		&cf.ID, &cf.ProductID, &cf.FromUnitID, &cf.ToUnitID, &cf.Amount, &cf.Main,
	)
	if err != nil {
		return nil, fmt.Errorf("create conversion factor: %w", err)
	}
	return cf, nil
}

func (s *Service) GetConversionFactorByID(ctx context.Context, id uuid.UUID) (*ConversionFactor, error) {
	cf := &ConversionFactor{}
	err := s.pool.QueryRow(ctx, `
		SELECT id, product_id, from_unit_id, to_unit_id, amount, main
		FROM conversion_factors WHERE id = $1
	`, id).Scan(&cf.ID, &cf.ProductID, &cf.FromUnitID, &cf.ToUnitID, &cf.Amount, &cf.Main)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get conversion factor: %w", err)
	}
	return cf, nil
}

func (s *Service) ListConversionFactorsByProductID(ctx context.Context, productID uuid.UUID) ([]ConversionFactor, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, product_id, from_unit_id, to_unit_id, amount, main
		FROM conversion_factors WHERE product_id = $1 ORDER BY amount
	`, productID)
	if err != nil {
		return nil, fmt.Errorf("list conversion factors: %w", err)
	}
	defer rows.Close()

	factors := make([]ConversionFactor, 0)
	for rows.Next() {
		var cf ConversionFactor
		if err := rows.Scan(&cf.ID, &cf.ProductID, &cf.FromUnitID, &cf.ToUnitID, &cf.Amount, &cf.Main); err != nil {
			return nil, fmt.Errorf("scan conversion factor: %w", err)
		}
		factors = append(factors, cf)
	}
	return factors, nil
}

func (s *Service) UpdateConversionFactor(ctx context.Context, id uuid.UUID, req CreateConversionFactorRequest) (*ConversionFactor, error) {
	if req.FromUnitID == req.ToUnitID {
		return nil, fmt.Errorf("from_unit_id and to_unit_id must be different")
	}

	var existingProductID uuid.UUID
	if err := s.pool.QueryRow(ctx, `SELECT product_id FROM conversion_factors WHERE id = $1`, id).Scan(&existingProductID); err != nil {
		return nil, fmt.Errorf("get conversion factor: %w", err)
	}

	var count int
	err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM conversion_factors 
		WHERE product_id = $1 AND id != $2 AND (
			(from_unit_id = $3 AND to_unit_id = $4)
			OR (from_unit_id = $4 AND to_unit_id = $3)
		)
	`, existingProductID, id, req.FromUnitID, req.ToUnitID).Scan(&count)
	if err != nil {
		return nil, fmt.Errorf("check duplicate: %w", err)
	}
	if count > 0 {
		return nil, fmt.Errorf("a conversion factor between these units already exists for this product")
	}

	main := false
	if req.Main != nil {
		main = *req.Main
	}

	if main {
		if _, err := s.pool.Exec(ctx, `UPDATE conversion_factors SET main = false WHERE product_id = $1 AND main = true AND id != $2`, existingProductID, id); err != nil {
			return nil, fmt.Errorf("unset existing main: %w", err)
		}
	}

	cf := &ConversionFactor{}
	err = s.pool.QueryRow(ctx, `
		UPDATE conversion_factors SET from_unit_id = $2, to_unit_id = $3, amount = $4, main = $5
		WHERE id = $1
		RETURNING id, product_id, from_unit_id, to_unit_id, amount, main
	`, id, req.FromUnitID, req.ToUnitID, req.Amount, main).Scan(
		&cf.ID, &cf.ProductID, &cf.FromUnitID, &cf.ToUnitID, &cf.Amount, &cf.Main,
	)
	if err != nil {
		return nil, fmt.Errorf("update conversion factor: %w", err)
	}
	return cf, nil
}

func (s *Service) DeleteConversionFactor(ctx context.Context, id uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM conversion_factors WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete conversion factor: %w", err)
	}
	return nil
}

// Measurement Unit Classification

type MeasurementUnitClassification struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	Code string    `json:"code"`
}

type CreateMeasurementUnitClassificationRequest struct {
	Name string `json:"name" validate:"required"`
	Code string `json:"code" validate:"required"`
}

func (s *Service) CreateMeasurementUnitClassification(ctx context.Context, req CreateMeasurementUnitClassificationRequest) (*MeasurementUnitClassification, error) {
	muc := &MeasurementUnitClassification{}
	err := s.pool.QueryRow(ctx, `
		INSERT INTO measurement_unit_classifications (id, name, code)
		VALUES ($1, $2, $3)
		RETURNING id, name, code
	`, uuid.New(), req.Name, req.Code).Scan(&muc.ID, &muc.Name, &muc.Code)
	if err != nil {
		return nil, fmt.Errorf("create measurement unit classification: %w", err)
	}
	return muc, nil
}

func (s *Service) GetMeasurementUnitClassificationByID(ctx context.Context, id uuid.UUID) (*MeasurementUnitClassification, error) {
	muc := &MeasurementUnitClassification{}
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, code FROM measurement_unit_classifications WHERE id = $1
	`, id).Scan(&muc.ID, &muc.Name, &muc.Code)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get measurement unit classification: %w", err)
	}
	return muc, nil
}

func (s *Service) ListMeasurementUnitClassifications(ctx context.Context) ([]MeasurementUnitClassification, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, name, code FROM measurement_unit_classifications ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list measurement unit classifications: %w", err)
	}
	defer rows.Close()

	classifications := make([]MeasurementUnitClassification, 0)
	for rows.Next() {
		var muc MeasurementUnitClassification
		if err := rows.Scan(&muc.ID, &muc.Name, &muc.Code); err != nil {
			return nil, fmt.Errorf("scan measurement unit classification: %w", err)
		}
		classifications = append(classifications, muc)
	}
	return classifications, nil
}

func (s *Service) UpdateMeasurementUnitClassification(ctx context.Context, id uuid.UUID, req CreateMeasurementUnitClassificationRequest) (*MeasurementUnitClassification, error) {
	muc := &MeasurementUnitClassification{}
	err := s.pool.QueryRow(ctx, `
		UPDATE measurement_unit_classifications SET name = $2, code = $3
		WHERE id = $1
		RETURNING id, name, code
	`, id, req.Name, req.Code).Scan(&muc.ID, &muc.Name, &muc.Code)
	if err != nil {
		return nil, fmt.Errorf("update measurement unit classification: %w", err)
	}
	return muc, nil
}

func (s *Service) DeleteMeasurementUnitClassification(ctx context.Context, id uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM measurement_unit_classifications WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete measurement unit classification: %w", err)
	}
	return nil
}

// Measurement Unit

type MeasurementUnit struct {
	ID               uuid.UUID  `json:"id"`
	Name             string     `json:"name"`
	Code             string     `json:"code"`
	Symbol           *string    `json:"symbol"`
	ClassificationID *uuid.UUID `json:"classification_id"`
}

type CreateMeasurementUnitRequest struct {
	Name             string     `json:"name" validate:"required"`
	Code             string     `json:"code" validate:"required"`
	Symbol           *string    `json:"symbol"`
	ClassificationID *uuid.UUID `json:"classification_id"`
}

func (s *Service) CreateMeasurementUnit(ctx context.Context, req CreateMeasurementUnitRequest) (*MeasurementUnit, error) {
	mu := &MeasurementUnit{}
	err := s.pool.QueryRow(ctx, `
		INSERT INTO measurement_units (id, name, code, symbol, classification_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, name, code, symbol, classification_id
	`, uuid.New(), req.Name, req.Code, req.Symbol, req.ClassificationID).Scan(&mu.ID, &mu.Name, &mu.Code, &mu.Symbol, &mu.ClassificationID)
	if err != nil {
		return nil, fmt.Errorf("create measurement unit: %w", err)
	}
	return mu, nil
}

func (s *Service) GetMeasurementUnitByID(ctx context.Context, id uuid.UUID) (*MeasurementUnit, error) {
	mu := &MeasurementUnit{}
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, code, symbol, classification_id FROM measurement_units WHERE id = $1
	`, id).Scan(&mu.ID, &mu.Name, &mu.Code, &mu.Symbol, &mu.ClassificationID)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get measurement unit: %w", err)
	}
	return mu, nil
}

func (s *Service) ListMeasurementUnits(ctx context.Context) ([]MeasurementUnit, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, name, code, symbol, classification_id FROM measurement_units ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list measurement units: %w", err)
	}
	defer rows.Close()

	units := make([]MeasurementUnit, 0)
	for rows.Next() {
		var mu MeasurementUnit
		if err := rows.Scan(&mu.ID, &mu.Name, &mu.Code, &mu.Symbol, &mu.ClassificationID); err != nil {
			return nil, fmt.Errorf("scan measurement unit: %w", err)
		}
		units = append(units, mu)
	}
	return units, nil
}

func (s *Service) UpdateMeasurementUnit(ctx context.Context, id uuid.UUID, req CreateMeasurementUnitRequest) (*MeasurementUnit, error) {
	mu := &MeasurementUnit{}
	err := s.pool.QueryRow(ctx, `
		UPDATE measurement_units SET name = $2, code = $3, symbol = $4, classification_id = $5
		WHERE id = $1
		RETURNING id, name, code, symbol, classification_id
	`, id, req.Name, req.Code, req.Symbol, req.ClassificationID).Scan(&mu.ID, &mu.Name, &mu.Code, &mu.Symbol, &mu.ClassificationID)
	if err != nil {
		return nil, fmt.Errorf("update measurement unit: %w", err)
	}
	return mu, nil
}

func (s *Service) DeleteMeasurementUnit(ctx context.Context, id uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM measurement_units WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete measurement unit: %w", err)
	}
	return nil
}

// Price Category

type PriceCategory struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	Code string    `json:"code"`
}

type CreatePriceCategoryRequest struct {
	Name string `json:"name" validate:"required"`
	Code string `json:"code" validate:"required"`
}

func (s *Service) CreatePriceCategory(ctx context.Context, req CreatePriceCategoryRequest) (*PriceCategory, error) {
	pc := &PriceCategory{}
	err := s.pool.QueryRow(ctx, `
		INSERT INTO price_categories (id, name, code)
		VALUES ($1, $2, $3)
		RETURNING id, name, code
	`, uuid.New(), req.Name, req.Code).Scan(&pc.ID, &pc.Name, &pc.Code)
	if err != nil {
		return nil, fmt.Errorf("create price category: %w", err)
	}
	return pc, nil
}

func (s *Service) GetPriceCategoryByID(ctx context.Context, id uuid.UUID) (*PriceCategory, error) {
	pc := &PriceCategory{}
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, code FROM price_categories WHERE id = $1
	`, id).Scan(&pc.ID, &pc.Name, &pc.Code)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get price category: %w", err)
	}
	return pc, nil
}

func (s *Service) ListPriceCategories(ctx context.Context) ([]PriceCategory, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, name, code FROM price_categories ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list price categories: %w", err)
	}
	defer rows.Close()

	categories := make([]PriceCategory, 0)
	for rows.Next() {
		var pc PriceCategory
		if err := rows.Scan(&pc.ID, &pc.Name, &pc.Code); err != nil {
			return nil, fmt.Errorf("scan price category: %w", err)
		}
		categories = append(categories, pc)
	}
	return categories, nil
}

func (s *Service) UpdatePriceCategory(ctx context.Context, id uuid.UUID, req CreatePriceCategoryRequest) (*PriceCategory, error) {
	pc := &PriceCategory{}
	err := s.pool.QueryRow(ctx, `
		UPDATE price_categories SET name = $2, code = $3
		WHERE id = $1
		RETURNING id, name, code
	`, id, req.Name, req.Code).Scan(&pc.ID, &pc.Name, &pc.Code)
	if err != nil {
		return nil, fmt.Errorf("update price category: %w", err)
	}
	return pc, nil
}

func (s *Service) DeletePriceCategory(ctx context.Context, id uuid.UUID) error {
	var code string
	err := s.pool.QueryRow(ctx, `SELECT code FROM price_categories WHERE id = $1`, id).Scan(&code)
	if err == pgx.ErrNoRows {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("get price category: %w", err)
	}
	if code == "retail" {
		return fmt.Errorf("CANNOT_DELETE_RETAIL")
	}

	_, err = s.pool.Exec(ctx, `DELETE FROM price_categories WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete price category: %w", err)
	}
	return nil
}

// Price

type ProductBranchPrice struct {
	PriceID         uuid.UUID  `json:"id"`
	ProductID       uuid.UUID  `json:"product_id"`
	PriceCategoryID *uuid.UUID `json:"price_category_id"`
	Amount          float64    `json:"amount"`
	Currency        string     `json:"currency"`
}

type CreatePriceRequest struct {
	ProductID       uuid.UUID  `json:"product_id" validate:"required"`
	PriceCategoryID *uuid.UUID `json:"price_category_id"`
	Amount          float64    `json:"amount" validate:"required"`
}

func (s *Service) CreatePrice(ctx context.Context, req CreatePriceRequest) (*ProductBranchPrice, error) {
	currency := "USD"
	p := &ProductBranchPrice{}
	err := s.pool.QueryRow(ctx, `
		INSERT INTO product_branch_prices (id, product_id, price_category_id, amount, currency)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, product_id, price_category_id, amount, currency
	`, uuid.New(), req.ProductID, req.PriceCategoryID, req.Amount, currency).Scan(
		&p.PriceID, &p.ProductID, &p.PriceCategoryID, &p.Amount, &p.Currency,
	)
	if err != nil {
		return nil, fmt.Errorf("create price: %w", err)
	}
	return p, nil
}

func (s *Service) GetPriceByID(ctx context.Context, id uuid.UUID) (*ProductBranchPrice, error) {
	p := &ProductBranchPrice{}
	err := s.pool.QueryRow(ctx, `
		SELECT id, product_id, price_category_id, amount, currency
		FROM product_branch_prices WHERE id = $1
	`, id).Scan(&p.PriceID, &p.ProductID, &p.PriceCategoryID, &p.Amount, &p.Currency)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get price: %w", err)
	}
	return p, nil
}

func (s *Service) ListPricesByProductID(ctx context.Context, productID uuid.UUID) ([]ProductBranchPrice, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, product_id, price_category_id, amount, currency
		FROM product_branch_prices WHERE product_id = $1
	`, productID)
	if err != nil {
		return nil, fmt.Errorf("list prices: %w", err)
	}
	defer rows.Close()

	prices := make([]ProductBranchPrice, 0)
	for rows.Next() {
		var p ProductBranchPrice
		if err := rows.Scan(&p.PriceID, &p.ProductID, &p.PriceCategoryID, &p.Amount, &p.Currency); err != nil {
			return nil, fmt.Errorf("scan price: %w", err)
		}
		prices = append(prices, p)
	}
	return prices, nil
}

func (s *Service) UpdatePrice(ctx context.Context, id uuid.UUID, req CreatePriceRequest) (*ProductBranchPrice, error) {
	currency := "USD"
	p := &ProductBranchPrice{}
	err := s.pool.QueryRow(ctx, `
		UPDATE product_branch_prices SET price_category_id = $2, amount = $3, currency = $4
		WHERE id = $1
		RETURNING id, product_id, price_category_id, amount, currency
	`, id, req.PriceCategoryID, req.Amount, currency).Scan(
		&p.PriceID, &p.ProductID, &p.PriceCategoryID, &p.Amount, &p.Currency,
	)
	if err != nil {
		return nil, fmt.Errorf("update price: %w", err)
	}
	return p, nil
}

func (s *Service) DeletePrice(ctx context.Context, id uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM product_branch_prices WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete price: %w", err)
	}
	return nil
}
