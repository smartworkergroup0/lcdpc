package dashboard

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) OrdersByStatus(ctx context.Context, branchID string) ([]OrdersByStatusItem, error) {
	query := `
		SELECT status, COUNT(*)::int, COALESCE(SUM(price_total), 0)
		FROM orders
		WHERE deleted_at IS NULL
	`
	args := []any{}
	if branchID != "" {
		query += " AND branch_id = $1"
		args = append(args, branchID)
	}
	query += " GROUP BY status ORDER BY status"

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("orders by status: %w", err)
	}
	defer rows.Close()

	var items []OrdersByStatusItem
	for rows.Next() {
		var item OrdersByStatusItem
		if err := rows.Scan(&item.Status, &item.Count, &item.TotalRevenue); err != nil {
			return nil, fmt.Errorf("scan orders by status: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) SalesTrend(ctx context.Context, days int, branchID string) ([]SalesTrendItem, error) {
	if days <= 0 {
		days = 30
	}
	since := time.Now().UTC().AddDate(0, 0, -days).Truncate(24 * time.Hour)

	query := `
		SELECT
			TO_CHAR(h.created_at_utc, 'YYYY-MM-DD') AS day,
			COUNT(DISTINCT o.id)::int,
			COALESCE(SUM(o.price_total), 0)
		FROM orders o
		JOIN order_status_history h ON o.id = h.order_id
		WHERE o.deleted_at IS NULL
		  AND h.to_status = 'COMPLETED'
		  AND h.created_at_utc >= $1
	`
	args := []any{since}
	if branchID != "" {
		query += " AND branch_id = $2"
		args = append(args, branchID)
	}
	query += " GROUP BY day ORDER BY day"

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("sales trend: %w", err)
	}
	defer rows.Close()

	var items []SalesTrendItem
	for rows.Next() {
		var item SalesTrendItem
		if err := rows.Scan(&item.Date, &item.Count, &item.Revenue); err != nil {
			return nil, fmt.Errorf("scan sales trend: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) TopProducts(ctx context.Context, days, limit int, branchID string) ([]TopItem, error) {
	if days <= 0 {
		days = 30
	}
	if limit <= 0 {
		limit = 10
	}
	since := time.Now().UTC().AddDate(0, 0, -days)

	query := `
		SELECT
			COALESCE(oi.product_id::text, ''),
			COALESCE(p.name, 'Desconocido'),
			SUM(oi.quantity)::int,
			COALESCE(SUM(oi.subtotal), 0)
		FROM order_items oi
		JOIN orders o ON oi.order_id = o.id
		LEFT JOIN products p ON oi.product_id = p.product_id
		WHERE o.deleted_at IS NULL
		  AND oi.item_type = 'product'
		  AND o.created_at_utc >= $1
		  AND o.status = 'COMPLETED'
	`
	args := []any{since}
	paramIdx := 2
	if branchID != "" {
		query += fmt.Sprintf(" AND o.branch_id = $%d", paramIdx)
		args = append(args, branchID)
		paramIdx++
	}
	query += fmt.Sprintf(`
		GROUP BY oi.product_id, p.name
		ORDER BY SUM(oi.quantity) DESC
		LIMIT $%d
	`, paramIdx)
	args = append(args, limit)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("top products: %w", err)
	}
	defer rows.Close()

	var items []TopItem
	for rows.Next() {
		var item TopItem
		if err := rows.Scan(&item.ID, &item.Name, &item.TotalQuantity, &item.TotalRevenue); err != nil {
			return nil, fmt.Errorf("scan top products: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) TopBundles(ctx context.Context, days, limit int, branchID string) ([]TopItem, error) {
	if days <= 0 {
		days = 30
	}
	if limit <= 0 {
		limit = 10
	}
	since := time.Now().UTC().AddDate(0, 0, -days)

	query := `
		SELECT
			COALESCE(oi.bundle_id::text, ''),
			COALESCE(b.name, 'Desconocido'),
			SUM(oi.quantity)::int,
			COALESCE(SUM(oi.subtotal), 0)
		FROM order_items oi
		JOIN orders o ON oi.order_id = o.id
		LEFT JOIN bundles b ON oi.bundle_id = b.bundle_id
		WHERE o.deleted_at IS NULL
		  AND oi.item_type = 'bundle'
		  AND o.created_at_utc >= $1
		  AND o.status = 'COMPLETED'
	`
	args := []any{since}
	paramIdx := 2
	if branchID != "" {
		query += fmt.Sprintf(" AND o.branch_id = $%d", paramIdx)
		args = append(args, branchID)
		paramIdx++
	}
	query += fmt.Sprintf(`
		GROUP BY oi.bundle_id, b.name
		ORDER BY SUM(oi.quantity) DESC
		LIMIT $%d
	`, paramIdx)
	args = append(args, limit)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("top bundles: %w", err)
	}
	defer rows.Close()

	var items []TopItem
	for rows.Next() {
		var item TopItem
		if err := rows.Scan(&item.ID, &item.Name, &item.TotalQuantity, &item.TotalRevenue); err != nil {
			return nil, fmt.Errorf("scan top bundles: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) Summary(ctx context.Context, branchID string) (*SummaryData, error) {
	branchFilter := ""
	args := []any{}
	if branchID != "" {
		branchFilter = " AND branch_id = $1"
		args = append(args, branchID)
	}
	query := fmt.Sprintf(`
		SELECT
			COALESCE((SELECT COUNT(*) FROM products WHERE 1=1%s), 0),
			COALESCE((SELECT COUNT(*) FROM bundles WHERE 1=1%s), 0),
			COALESCE((SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL%s), 0),
			COALESCE((SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL AND status = 'PENDING_REVIEW'%s), 0)
	`, branchFilter, branchFilter, branchFilter, branchFilter)

	var data SummaryData
	if err := s.pool.QueryRow(ctx, query, args...).Scan(&data.TotalProducts, &data.TotalBundles, &data.TotalOrders, &data.PendingOrders); err != nil {
		return nil, fmt.Errorf("summary: %w", err)
	}
	return &data, nil
}

func (s *Service) StockHealth(ctx context.Context, branchID string) (*StockHealth, error) {
	query := `
		SELECT
			COUNT(*) FILTER (WHERE stock_available <= 0)::int,
			COUNT(*) FILTER (WHERE stock_available > 0 AND stock_available <= 5)::int,
			COUNT(*) FILTER (WHERE stock_available > 5)::int
		FROM products
		WHERE is_active = true
	`
	args := []any{}
	if branchID != "" {
		query += " AND branch_id = $1"
		args = append(args, branchID)
	}

	var health StockHealth
	if err := s.pool.QueryRow(ctx, query, args...).Scan(&health.OutOfStock, &health.LowStock, &health.Healthy); err != nil {
		return nil, fmt.Errorf("stock health: %w", err)
	}

	lowQuery := `
		SELECT
			p.product_id::text,
			COALESCE(p.name, ''),
			COALESCE(p.sku, ''),
			p.stock_available,
			p.stock,
			COALESCE(p.branch_id::text, ''),
			p.base_unit_id::text
		FROM products p
		WHERE p.is_active = true
		  AND p.stock_available > 0
		  AND p.stock_available <= 5
	`
	lowArgs := []any{}
	if branchID != "" {
		lowQuery += " AND branch_id = $1"
		lowArgs = append(lowArgs, branchID)
	}
	lowQuery += " ORDER BY stock_available ASC LIMIT 20"

	rows, err := s.pool.Query(ctx, lowQuery, lowArgs...)
	if err != nil {
		return nil, fmt.Errorf("low stock items: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var item LowStockItem
		if err := rows.Scan(&item.ProductID, &item.Name, &item.SKU, &item.StockAvailable, &item.Stock, &item.BranchID, &item.BaseUnitID); err != nil {
			return nil, fmt.Errorf("scan low stock item: %w", err)
		}
		health.Items = append(health.Items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &health, nil
}

func (s *Service) TodayActivity(ctx context.Context, branchID string) (*TodayActivity, error) {
	today := time.Now().UTC().Truncate(24 * time.Hour)

	createdQuery := `
		SELECT COUNT(*)::int
		FROM orders
		WHERE deleted_at IS NULL AND created_at_utc >= $1
	`
	completedQuery := `
		SELECT COUNT(DISTINCT o.id)::int, COALESCE(SUM(o.price_total), 0)
		FROM orders o
		JOIN order_status_history h ON o.id = h.order_id
		WHERE o.deleted_at IS NULL AND h.to_status = 'COMPLETED' AND h.created_at_utc >= $1
	`
	pendingQuery := `
		SELECT COUNT(*)::int
		FROM orders
		WHERE deleted_at IS NULL AND status = 'PENDING_REVIEW'
	`
	args := []any{today}
	if branchID != "" {
		createdQuery += " AND branch_id = $2"
		completedQuery += " AND branch_id = $2"
		pendingQuery += " AND branch_id = $1"
		args = append(args, branchID)
	}

	var created int
	if err := s.pool.QueryRow(ctx, createdQuery, args...).Scan(&created); err != nil {
		return nil, fmt.Errorf("today activity: %w", err)
	}

	var completed int
	var revenue float64
	if err := s.pool.QueryRow(ctx, completedQuery, args...).Scan(&completed, &revenue); err != nil {
		return nil, fmt.Errorf("today activity: %w", err)
	}

	pendingArgs := []any{}
	if branchID != "" {
		pendingArgs = append(pendingArgs, branchID)
	} else {
		pendingArgs = append(pendingArgs, today)
	}
	var pending int
	if err := s.pool.QueryRow(ctx, pendingQuery, pendingArgs...).Scan(&pending); err != nil {
		return nil, fmt.Errorf("today activity: %w", err)
	}

	return &TodayActivity{
		OrdersCreatedToday:    created,
		OrdersCompletedToday: completed,
		PendingOrders:       pending,
		RevenueToday:        revenue,
	}, nil
}

func (s *Service) OrdersNeedingAttention(ctx context.Context, branchID string) ([]AttentionStatusItem, error) {
	query := `
		SELECT status, COUNT(*)::int
		FROM orders
		WHERE deleted_at IS NULL
		  AND status NOT IN ('REJECTED_BY_VALIDATION', 'DELIVERY_FAILED', 'COMPLETED', 'CANCELLED_BY_CUSTOMER')
	`
	args := []any{}
	if branchID != "" {
		query += " AND branch_id = $1"
		args = append(args, branchID)
	}
	query += " GROUP BY status ORDER BY COUNT(*) DESC"

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("orders needing attention: %w", err)
	}
	defer rows.Close()

	var items []AttentionStatusItem
	for rows.Next() {
		var item AttentionStatusItem
		if err := rows.Scan(&item.Status, &item.Count); err != nil {
			return nil, fmt.Errorf("scan attention item: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) RecentOrders(ctx context.Context, branchID string, limit int) ([]RecentOrderItem, error) {
	if limit <= 0 {
		limit = 10
	}
	today := time.Now().UTC().Truncate(24 * time.Hour)

	query := `
		SELECT
			o.display_id,
			o.status,
			COALESCE(o.price_total, 0),
			o.total_items,
			TO_CHAR(o.created_at_utc, 'YYYY-MM-DD HH24:MI') AS created_at,
			COALESCE(p.name, '') AS customer_name
		FROM orders o
		LEFT JOIN persons p ON o.person_id = p.id
		WHERE o.deleted_at IS NULL
		  AND o.created_at_utc >= $1
	`
	args := []any{today}
	paramIdx := 2
	if branchID != "" {
		query += fmt.Sprintf(" AND o.branch_id = $%d", paramIdx)
		args = append(args, branchID)
		paramIdx++
	}
	query += fmt.Sprintf(" ORDER BY o.created_at_utc DESC LIMIT $%d", paramIdx)
	args = append(args, limit)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("recent orders: %w", err)
	}
	defer rows.Close()

	var items []RecentOrderItem
	for rows.Next() {
		var item RecentOrderItem
		if err := rows.Scan(&item.DisplayID, &item.Status, &item.PriceTotal, &item.TotalItems, &item.CreatedAt, &item.CustomerName); err != nil {
			return nil, fmt.Errorf("scan recent order: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
