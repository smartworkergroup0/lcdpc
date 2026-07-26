package pricing

import (
	"context"
	"fmt"
	"net/url"

	"github.com/google/uuid"
)

// ── DTO structs ──────────────────────────────────────────

type CatalogResponse struct {
	Message string        `json:"message"`
	Count   int           `json:"count"`
	Items   []CatalogItem `json:"products"`
}

type CatalogItem struct {
	SKU               string                    `json:"sku"`
	Name              string                    `json:"name"`
	URL               string                    `json:"url"`
	Classification    CatalogClassification     `json:"classification"`
	Inventory         CatalogInventory          `json:"inventory"`
	PurchasingOptions []CatalogPurchasingOption `json:"purchasing_options"`
	Items             []CatalogBundleItem       `json:"items,omitempty"`
}

type CatalogClassification struct {
	Line     string `json:"line"`
	Category string `json:"category"`
}

type CatalogInventory struct {
	StockAvailable  float64 `json:"stock_available"`
	StockMeasuredIn string  `json:"stock_measured_in"`
	UnitSymbol      string  `json:"unit_symbol"`
}

type CatalogPurchasingOption struct {
	Modality      string  `json:"modality"`
	Unit          string  `json:"unit"`
	UnitsIncluded float64 `json:"units_included"`
	TotalPrice    float64 `json:"total_price"`
	AIHint        string  `json:"ai_hint"`
}

type CatalogBundleItem struct {
	Name string `json:"name"`
	Code string `json:"code"`
}

// ── Internal row types ───────────────────────────────────

type catalogProductRow struct {
	ProductID      uuid.UUID
	SKU            string
	Name           string
	Img            *string
	StockAvailable float64
	BranchCode     string
	BrandName      string
	CategoryName   string
	UnitName       string
	UnitSymbol     string
	BaseUnitID     *uuid.UUID
}

type catalogBundleRow struct {
	BundleID       uuid.UUID
	Code           string
	Name           string
	Img            *string
	StockAvailable float64
	BranchCode     string
	CategoryName   string
}

type catalogPriceRow struct {
	EntityID uuid.UUID
	Amount   float64
}

type catalogConversionRow struct {
	ProductID  uuid.UUID
	Amount     float64
	ToUnitName string
}

// ── Service methods ──────────────────────────────────────

func (s *Service) ListCatalogProducts(ctx context.Context, filter ProductFilter, domain string) (*CatalogResponse, error) {
	countQuery := `SELECT COUNT(*) FROM products WHERE is_active = true`
	dataQuery := `
		SELECT p.product_id, p.sku, p.name, p.img, p.stock_available,
		       COALESCE(br.code, '') AS branch_code,
		       COALESCE(b.name, '') AS brand_name,
		       COALESCE(c.name, '') AS category_name,
		       COALESCE(mu.name, 'Unidad') AS unit_name,
		       COALESCE(mu.symbol, '') AS unit_symbol,
		       p.base_unit_id
		FROM products p
		LEFT JOIN branches br ON br.id = p.branch_id
		LEFT JOIN brands b ON b.id = p.brand_id
		LEFT JOIN categories c ON c.category_id = p.category_id
		LEFT JOIN measurement_units mu ON mu.id = p.base_unit_id
		WHERE p.is_active = true`

	var args []interface{}
	argIdx := 1

	if filter.CategoryID != nil {
		countQuery += fmt.Sprintf(` AND category_id = $%d`, argIdx)
		dataQuery += fmt.Sprintf(` AND p.category_id = $%d`, argIdx)
		args = append(args, *filter.CategoryID)
		argIdx++
	}
	if filter.Name != nil {
		countQuery += fmt.Sprintf(` AND name ILIKE '%%' || $%d || '%%'`, argIdx)
		dataQuery += fmt.Sprintf(` AND p.name ILIKE '%%' || $%d || '%%'`, argIdx)
		args = append(args, *filter.Name)
		argIdx++
	}
	if filter.Sku != nil {
		countQuery += fmt.Sprintf(` AND sku = $%d`, argIdx)
		dataQuery += fmt.Sprintf(` AND p.sku = $%d`, argIdx)
		args = append(args, *filter.Sku)
		argIdx++
	}
	if filter.BranchID != nil {
		countQuery += fmt.Sprintf(` AND branch_id = $%d`, argIdx)
		dataQuery += fmt.Sprintf(` AND p.branch_id = $%d`, argIdx)
		args = append(args, *filter.BranchID)
		argIdx++
	}

	var totalCount int
	if err := s.pool.QueryRow(ctx, countQuery, args...).Scan(&totalCount); err != nil {
		return nil, fmt.Errorf("count catalog products: %w", err)
	}

	dataQuery += ` ORDER BY p.name`

	rows, err := s.pool.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("list catalog products: %w", err)
	}
	defer rows.Close()

	var productRows []catalogProductRow
	for rows.Next() {
		var r catalogProductRow
		if err := rows.Scan(&r.ProductID, &r.SKU, &r.Name, &r.Img, &r.StockAvailable,
			&r.BranchCode, &r.BrandName, &r.CategoryName, &r.UnitName, &r.UnitSymbol, &r.BaseUnitID); err != nil {
			return nil, fmt.Errorf("scan catalog product: %w", err)
		}
		productRows = append(productRows, r)
	}

	if len(productRows) == 0 {
		return &CatalogResponse{Message: "success", Count: totalCount, Items: []CatalogItem{}}, nil
	}

	ids := make([]uuid.UUID, len(productRows))
	baseUnitIDs := make(map[uuid.UUID]bool)
	for i, r := range productRows {
		ids[i] = r.ProductID
		if r.BaseUnitID != nil {
			baseUnitIDs[*r.BaseUnitID] = true
		}
	}

	// Load retail prices
	priceMap, err := s.loadRetailPrices(ctx, ids)
	if err != nil {
		return nil, err
	}

	// Load conversion factors with unit names
	convMap, err := s.loadConversionFactors(ctx, ids)
	if err != nil {
		return nil, err
	}

	// Build catalog items
	items := make([]CatalogItem, 0, len(productRows))
	for _, r := range productRows {
		item := CatalogItem{
			SKU:  r.SKU,
			Name: r.Name,
			URL:  buildProductURL(domain, r.BranchCode, r.SKU),
			Classification: CatalogClassification{
				Line:     r.BrandName,
				Category: r.CategoryName,
			},
			Inventory: CatalogInventory{
				StockAvailable:  r.StockAvailable,
				StockMeasuredIn: r.UnitName,
				UnitSymbol:      r.UnitSymbol,
			},
		}

		// Build purchasing options
		retailPrice := priceMap[r.ProductID]

		// First option: base unit
		baseOption := CatalogPurchasingOption{
			Modality:      "",
			Unit:          r.UnitName,
			UnitsIncluded: 1,
			TotalPrice:    retailPrice,
			AIHint:        fmt.Sprintf("Se vende por %s individual.", r.UnitName),
		}
		item.PurchasingOptions = append(item.PurchasingOptions, baseOption)

		// Additional options: conversion factors
		for _, cf := range convMap[r.ProductID] {
			option := CatalogPurchasingOption{
				Modality:      "",
				Unit:          cf.ToUnitName,
				UnitsIncluded: cf.Amount,
				TotalPrice:    retailPrice * cf.Amount,
				AIHint:        fmt.Sprintf("Se vende por %s de %v unidades.", cf.ToUnitName, cf.Amount),
			}
			item.PurchasingOptions = append(item.PurchasingOptions, option)
		}

		items = append(items, item)
	}

	return &CatalogResponse{Message: "success", Count: totalCount, Items: items}, nil
}

func (s *Service) ListCatalogBundles(ctx context.Context, filter BundleFilter, domain string) (*CatalogResponse, error) {
	countQuery := `SELECT COUNT(*) FROM bundles WHERE status = 'Active'`
	dataQuery := `
		SELECT bu.bundle_id, bu.code, bu.name, bu.img, bu.stock_available,
		       COALESCE(br.code, '') AS branch_code,
		       COALESCE(c.name, '') AS category_name
		FROM bundles bu
		LEFT JOIN branches br ON br.id = bu.branch_id
		LEFT JOIN categories c ON c.category_id = bu.category_id
		WHERE bu.status = 'Active'`

	var args []interface{}
	argIdx := 1

	if filter.CategoryID != nil {
		countQuery += fmt.Sprintf(` AND category_id = $%d`, argIdx)
		dataQuery += fmt.Sprintf(` AND bu.category_id = $%d`, argIdx)
		args = append(args, *filter.CategoryID)
		argIdx++
	}
	if filter.Name != nil {
		countQuery += fmt.Sprintf(` AND name ILIKE '%%' || $%d || '%%'`, argIdx)
		dataQuery += fmt.Sprintf(` AND bu.name ILIKE '%%' || $%d || '%%'`, argIdx)
		args = append(args, *filter.Name)
		argIdx++
	}
	if filter.Code != nil {
		countQuery += fmt.Sprintf(` AND code = $%d`, argIdx)
		dataQuery += fmt.Sprintf(` AND bu.code = $%d`, argIdx)
		args = append(args, *filter.Code)
		argIdx++
	}
	if filter.BranchID != nil {
		countQuery += fmt.Sprintf(` AND branch_id = $%d`, argIdx)
		dataQuery += fmt.Sprintf(` AND bu.branch_id = $%d`, argIdx)
		args = append(args, *filter.BranchID)
		argIdx++
	}

	var totalCount int
	if err := s.pool.QueryRow(ctx, countQuery, args...).Scan(&totalCount); err != nil {
		return nil, fmt.Errorf("count catalog bundles: %w", err)
	}

	dataQuery += ` ORDER BY bu.name`
	rows, err := s.pool.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("list catalog bundles: %w", err)
	}
	defer rows.Close()

	var bundleRows []catalogBundleRow
	for rows.Next() {
		var r catalogBundleRow
		if err := rows.Scan(&r.BundleID, &r.Code, &r.Name, &r.Img, &r.StockAvailable, &r.BranchCode, &r.CategoryName); err != nil {
			return nil, fmt.Errorf("scan catalog bundle: %w", err)
		}
		bundleRows = append(bundleRows, r)
	}

	if len(bundleRows) == 0 {
		return &CatalogResponse{Message: "success", Count: totalCount, Items: []CatalogItem{}}, nil
	}

	ids := make([]uuid.UUID, len(bundleRows))
	for i, r := range bundleRows {
		ids[i] = r.BundleID
	}

	// Load retail prices for bundles
	bundlePriceMap, err := s.loadBundleRetailPrices(ctx, ids)
	if err != nil {
		return nil, err
	}

	// Load bundle items
	bundleItemsMap, err := s.loadBundleItems(ctx, ids)
	if err != nil {
		return nil, err
	}

	// Build catalog items
	items := make([]CatalogItem, 0, len(bundleRows))
	for _, r := range bundleRows {
		retailPrice := bundlePriceMap[r.BundleID]

		item := CatalogItem{
			SKU:  r.Code,
			Name: r.Name,
			URL:  buildBundleURL(domain, r.BranchCode, r.Code),
			Classification: CatalogClassification{
				Line:     "N/A",
				Category: r.CategoryName,
			},
			Inventory: CatalogInventory{
				StockAvailable:  r.StockAvailable,
				StockMeasuredIn: "Unidad",
			},
			PurchasingOptions: []CatalogPurchasingOption{
				{
					Modality:      "",
					Unit:          "Unidad",
					UnitsIncluded: 1,
					TotalPrice:    retailPrice,
					AIHint:        "Se vende por Unidad individual.",
				},
			},
			Items: bundleItemsMap[r.BundleID],
		}

		items = append(items, item)
	}

	return &CatalogResponse{Message: "success", Count: totalCount, Items: items}, nil
}

// ── Helpers ──────────────────────────────────────────────

func (s *Service) loadRetailPrices(ctx context.Context, productIDs []uuid.UUID) (map[uuid.UUID]float64, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT pbp.product_id, pbp.amount
		FROM product_branch_prices pbp
		JOIN price_categories pc ON pc.id = pbp.price_category_id
		WHERE pbp.product_id = ANY($1) AND pc.code = 'RETAIL'
	`, productIDs)
	if err != nil {
		return nil, fmt.Errorf("load retail prices: %w", err)
	}
	defer rows.Close()

	m := make(map[uuid.UUID]float64, len(productIDs))
	for rows.Next() {
		var pid uuid.UUID
		var amount float64
		if err := rows.Scan(&pid, &amount); err != nil {
			return nil, fmt.Errorf("scan retail price: %w", err)
		}
		m[pid] = amount
	}
	return m, nil
}

func (s *Service) loadBundleRetailPrices(ctx context.Context, bundleIDs []uuid.UUID) (map[uuid.UUID]float64, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT bp.bundle_id, bp.amount
		FROM bundle_prices bp
		JOIN price_categories pc ON pc.id = bp.price_category_id
		WHERE bp.bundle_id = ANY($1) AND pc.code = 'RETAIL'
	`, bundleIDs)
	if err != nil {
		return nil, fmt.Errorf("load bundle retail prices: %w", err)
	}
	defer rows.Close()

	m := make(map[uuid.UUID]float64, len(bundleIDs))
	for rows.Next() {
		var bid uuid.UUID
		var amount float64
		if err := rows.Scan(&bid, &amount); err != nil {
			return nil, fmt.Errorf("scan bundle retail price: %w", err)
		}
		m[bid] = amount
	}
	return m, nil
}

func (s *Service) loadConversionFactors(ctx context.Context, productIDs []uuid.UUID) (map[uuid.UUID][]catalogConversionRow, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT cf.product_id, cf.amount, tu.name AS to_unit_name
		FROM conversion_factors cf
		JOIN measurement_units tu ON tu.id = cf.to_unit_id
		WHERE cf.product_id = ANY($1)
		ORDER BY cf.product_id, cf.amount
	`, productIDs)
	if err != nil {
		return nil, fmt.Errorf("load conversion factors: %w", err)
	}
	defer rows.Close()

	m := make(map[uuid.UUID][]catalogConversionRow)
	for rows.Next() {
		var r catalogConversionRow
		if err := rows.Scan(&r.ProductID, &r.Amount, &r.ToUnitName); err != nil {
			return nil, fmt.Errorf("scan conversion factor: %w", err)
		}
		m[r.ProductID] = append(m[r.ProductID], r)
	}
	return m, nil
}

func (s *Service) loadBundleItems(ctx context.Context, bundleIDs []uuid.UUID) (map[uuid.UUID][]CatalogBundleItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT bi.bundle_id, p.name, p.sku
		FROM bundle_items bi
		JOIN products p ON p.product_id = bi.product_id
		WHERE bi.bundle_id = ANY($1)
		ORDER BY bi.bundle_id, p.name
	`, bundleIDs)
	if err != nil {
		return nil, fmt.Errorf("load bundle items: %w", err)
	}
	defer rows.Close()

	m := make(map[uuid.UUID][]CatalogBundleItem)
	for rows.Next() {
		var bundleID uuid.UUID
		var item CatalogBundleItem
		if err := rows.Scan(&bundleID, &item.Name, &item.Code); err != nil {
			return nil, fmt.Errorf("scan bundle item: %w", err)
		}
		m[bundleID] = append(m[bundleID], item)
	}
	return m, nil
}

func buildProductURL(domain, branchCode, sku string) string {
	params := url.Values{}
	if branchCode != "" {
		params.Set("branch", branchCode)
	}
	if sku != "" {
		params.Set("product", sku)
	}
	if len(params) == 0 {
		return domain
	}
	return domain + "?" + params.Encode()
}

func buildBundleURL(domain, branchCode, code string) string {
	params := url.Values{}
	if branchCode != "" {
		params.Set("branch", branchCode)
	}
	if code != "" {
		params.Set("bundle", code)
	}
	if len(params) == 0 {
		return domain
	}
	return domain + "?" + params.Encode()
}
