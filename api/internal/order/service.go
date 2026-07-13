package order

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lcdpc/lcdpc-go/internal/workflow"
)

type SystemConfigReader interface {
	GetNegativeStock(ctx context.Context) (bool, error)
}

type TransitionReader interface {
	GetEditableStatuses(ctx context.Context) (map[string]bool, error)
}

type Service struct {
	pool      *pgxpool.Pool
	sysCfg    SystemConfigReader
	transRepo TransitionReader
	wfReader  workflow.WorkflowReader
}

func NewService(pool *pgxpool.Pool, sysCfg SystemConfigReader, transRepo TransitionReader, wfReader workflow.WorkflowReader) *Service {
	return &Service{pool: pool, sysCfg: sysCfg, transRepo: transRepo, wfReader: wfReader}
}

func (s *Service) Create(ctx context.Context, req CreateOrderRequest, changedByUserID *uuid.UUID) (*Order, error) {
	if len(req.Items) == 0 {
		return nil, fmt.Errorf("order must have at least one item")
	}
	resolvedPersonID, resolvedClientUserID, err := s.resolveOrderIdentity(ctx, req, changedByUserID)
	if err != nil {
		return nil, err
	}

	for _, item := range req.Items {
		if item.ItemType != "product" && item.ItemType != "bundle" {
			return nil, fmt.Errorf("invalid item_type: %s", item.ItemType)
		}
		if item.ItemType == "product" && item.ProductID == uuid.Nil {
			return nil, fmt.Errorf("product_id is required for product items")
		}
		if item.ItemType == "bundle" && item.BundleID == uuid.Nil {
			return nil, fmt.Errorf("bundle_id is required for bundle items")
		}
		if item.ItemType == "product" {
			if err := s.validateItemPrice(ctx, item.ProductID, item.UnitPrice); err != nil {
				return nil, err
			}
		}
		if item.ItemType == "bundle" {
			if err := s.validateBundlePrice(ctx, item.BundleID, item.UnitPrice); err != nil {
				return nil, err
			}
		}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	orderID := uuid.New()

	var displayID string
	err = tx.QueryRow(ctx, `SELECT generate_order_display_id()`).Scan(&displayID)
	if err != nil {
		return nil, fmt.Errorf("generate display_id: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO orders (id, display_id, branch_id, person_id, client_user_id, status, price_total, total_items, currency, notes, created_at_utc, updated_at_utc)
		VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 'USD', $7, now(), now())
	`, orderID, displayID, req.BranchID, resolvedPersonID, resolvedClientUserID, StatusPendingReview, nullString(req.Notes))
	if err != nil {
		return nil, fmt.Errorf("insert order: %w", err)
	}

	var priceTotal float64
	var totalItems int

	negativeStock, _ := s.sysCfg.GetNegativeStock(ctx)

	for _, item := range req.Items {
		subtotal := item.Quantity * item.UnitPrice
		priceTotal += subtotal
		totalItems += int(item.Quantity)

		var productID, bundleID *uuid.UUID
		if item.ItemType == "product" {
			productID = &item.ProductID

			var stock, stockAvailable, stockBlocked float64
			err = tx.QueryRow(ctx, `
				SELECT stock, stock_available, stock_blocked
				FROM products WHERE product_id = $1 FOR UPDATE
			`, item.ProductID).Scan(&stock, &stockAvailable, &stockBlocked)
			if err != nil {
				return nil, fmt.Errorf("get product stock: %w", err)
			}

			qty := item.Quantity
			if stockAvailable < qty && !negativeStock {
				return nil, fmt.Errorf("INSUFFICIENT_STOCK: product %s has %.4f available, requested %.4f", item.ProductID, stockAvailable, qty)
			}
			if stockBlocked+qty > stock {
				return nil, fmt.Errorf("STOCK_EXCEEDED: product %s stock=%.4f blocked=%.4f requested=%.4f", item.ProductID, stock, stockBlocked, qty)
			}

			_, err = tx.Exec(ctx, `
				UPDATE products
				SET stock_available = stock_available - $1, stock_blocked = stock_blocked + $1
				WHERE product_id = $2
			`, qty, item.ProductID)
			if err != nil {
				return nil, fmt.Errorf("update product stock: %w", err)
			}
		} else {
			bundleID = &item.BundleID
			var bundleStock, bundleAvailable, bundleBlocked float64
			var blocksProductStock bool
			err = tx.QueryRow(ctx, `
				SELECT stock, stock_available, stock_blocked, blocks_product_stock
				FROM bundles WHERE bundle_id = $1 FOR UPDATE
			`, item.BundleID).Scan(&bundleStock, &bundleAvailable, &bundleBlocked, &blocksProductStock)
			if err != nil {
				return nil, fmt.Errorf("get bundle stock: %w", err)
			}
			if blocksProductStock {
				qty := item.Quantity
				if bundleAvailable < qty && !negativeStock {
					return nil, fmt.Errorf("INSUFFICIENT_BUNDLE_STOCK: bundle %s has %.4f available, requested %.4f", item.BundleID, bundleAvailable, qty)
				}
				if bundleBlocked+qty > bundleStock {
					return nil, fmt.Errorf("BUNDLE_STOCK_EXCEEDED: bundle %s stock=%.4f blocked=%.4f requested=%.4f", item.BundleID, bundleStock, bundleBlocked, qty)
				}
				_, err = tx.Exec(ctx, `
					UPDATE bundles
					SET stock_available = stock_available - $1, stock_blocked = stock_blocked + $1
					WHERE bundle_id = $2
				`, qty, item.BundleID)
				if err != nil {
					return nil, fmt.Errorf("update bundle stock: %w", err)
				}

				if err := blockBundleProductStock(ctx, tx, item.BundleID, qty, negativeStock); err != nil {
					return nil, err
				}
			}
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO order_items (id, order_id, item_type, product_id, bundle_id, quantity, unit_price, subtotal, currency)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'USD')
		`, uuid.New(), orderID, item.ItemType, productID, bundleID, item.Quantity, item.UnitPrice, subtotal)
		if err != nil {
			return nil, fmt.Errorf("insert order item: %w", err)
		}
	}

	_, err = tx.Exec(ctx, `
		UPDATE orders SET price_total = $2, total_items = $3, updated_at_utc = now() WHERE id = $1
	`, orderID, priceTotal, totalItems)
	if err != nil {
		return nil, fmt.Errorf("update order totals: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at_utc)
		VALUES ($1, $2, NULL, $3, $4, NULL, now())
	`, uuid.New(), orderID, StatusPendingReview, nullableUUID(changedByUserID))
	if err != nil {
		return nil, fmt.Errorf("insert status history: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return s.GetByID(ctx, orderID)
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*Order, error) {
	o := &Order{}
	err := s.pool.QueryRow(ctx, `
		SELECT id, display_id, branch_id, COALESCE(person_id::text, ''), COALESCE(client_user_id::text, ''), status, price_total, total_items, currency, notes, deleted_at, created_at_utc, updated_at_utc
		FROM orders WHERE id = $1 AND deleted_at IS NULL
	`, id).Scan(&o.ID, &o.DisplayID, &o.BranchID, &o.personIDRaw, &o.clientUserIDRaw, &o.Status, &o.PriceTotal, &o.TotalItems,
		&o.Currency, &o.Notes, &o.DeletedAt, &o.CreatedAtUtc, &o.UpdatedAtUtc)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("ORDER_NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get order: %w", err)
	}
	if o.personIDRaw != "" {
		parsed, parseErr := uuid.Parse(o.personIDRaw)
		if parseErr != nil {
			return nil, fmt.Errorf("parse person id: %w", parseErr)
		}
		o.PersonID = &parsed
	}
	if o.clientUserIDRaw != "" {
		parsed, parseErr := uuid.Parse(o.clientUserIDRaw)
		if parseErr != nil {
			return nil, fmt.Errorf("parse client user id: %w", parseErr)
		}
		o.ClientUserID = &parsed
	}

	o.Items, err = s.getItems(ctx, id)
	if err != nil {
		return nil, err
	}

	return o, nil
}

func (s *Service) List(ctx context.Context, filter OrderFilter) ([]Order, int, error) {
	countQuery := `SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL`
	dataQuery := `SELECT id, display_id, branch_id, COALESCE(person_id::text, ''), COALESCE(client_user_id::text, ''), status, price_total, total_items, currency, notes, deleted_at, created_at_utc, updated_at_utc FROM orders WHERE deleted_at IS NULL`
	args := []interface{}{}
	argIdx := 1

	if filter.BranchID != nil {
		clause := fmt.Sprintf(" AND branch_id = $%d", argIdx)
		countQuery += clause
		dataQuery += clause
		args = append(args, *filter.BranchID)
		argIdx++
	}
	if filter.PersonID != nil {
		clause := fmt.Sprintf(" AND person_id = $%d", argIdx)
		countQuery += clause
		dataQuery += clause
		args = append(args, *filter.PersonID)
		argIdx++
	}
	if filter.ClientUserID != nil {
		clause := fmt.Sprintf(" AND client_user_id = $%d", argIdx)
		countQuery += clause
		dataQuery += clause
		args = append(args, *filter.ClientUserID)
		argIdx++
	}
	if filter.Status != nil {
		clause := fmt.Sprintf(" AND status = $%d", argIdx)
		countQuery += clause
		dataQuery += clause
		args = append(args, *filter.Status)
		argIdx++
	}
	if filter.DisplayID != nil {
		clause := fmt.Sprintf(" AND display_id ILIKE $%d", argIdx)
		countQuery += clause
		dataQuery += clause
		args = append(args, "%"+*filter.DisplayID+"%")
		argIdx++
	}

	var totalCount int
	if err := s.pool.QueryRow(ctx, countQuery, args...).Scan(&totalCount); err != nil {
		return nil, 0, fmt.Errorf("count orders: %w", err)
	}

	dataQuery += " ORDER BY created_at_utc DESC"
	limit := filter.GetLimit()
	offset := filter.GetOffset()
	dataQuery += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := s.pool.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list orders: %w", err)
	}
	defer rows.Close()

	orders := make([]Order, 0)
	for rows.Next() {
		var o Order
		if err := rows.Scan(&o.ID, &o.DisplayID, &o.BranchID, &o.personIDRaw, &o.clientUserIDRaw, &o.Status, &o.PriceTotal, &o.TotalItems,
			&o.Currency, &o.Notes, &o.DeletedAt, &o.CreatedAtUtc, &o.UpdatedAtUtc); err != nil {
			return nil, 0, fmt.Errorf("scan order: %w", err)
		}
		if o.personIDRaw != "" {
			parsed, parseErr := uuid.Parse(o.personIDRaw)
			if parseErr != nil {
				return nil, 0, fmt.Errorf("parse person id: %w", parseErr)
			}
			o.PersonID = &parsed
		}
		if o.clientUserIDRaw != "" {
			parsed, parseErr := uuid.Parse(o.clientUserIDRaw)
			if parseErr != nil {
				return nil, 0, fmt.Errorf("parse client user id: %w", parseErr)
			}
			o.ClientUserID = &parsed
		}
		orders = append(orders, o)
	}
	return orders, totalCount, nil
}

func (s *Service) ListWithHistory(ctx context.Context, filter MatrixFilter) ([]OrderWithHistory, int, error) {
	countQuery := `SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL`
	dataQuery := `SELECT id, display_id, branch_id, COALESCE(person_id::text, ''), COALESCE(client_user_id::text, ''), status, price_total, total_items, currency, notes, deleted_at, created_at_utc, updated_at_utc FROM orders WHERE deleted_at IS NULL`
	args := []interface{}{}
	argIdx := 1

	if filter.BranchID != nil {
		clause := fmt.Sprintf(" AND branch_id = $%d", argIdx)
		countQuery += clause
		dataQuery += clause
		args = append(args, *filter.BranchID)
		argIdx++
	}
	if filter.DateFrom != nil {
		clause := fmt.Sprintf(" AND created_at_utc >= $%d", argIdx)
		countQuery += clause
		dataQuery += clause
		args = append(args, *filter.DateFrom)
		argIdx++
	}
	if filter.DateTo != nil {
		clause := fmt.Sprintf(" AND created_at_utc < $%d", argIdx)
		countQuery += clause
		dataQuery += clause
		args = append(args, *filter.DateTo)
		argIdx++
	}

	var totalCount int
	if err := s.pool.QueryRow(ctx, countQuery, args...).Scan(&totalCount); err != nil {
		return nil, 0, fmt.Errorf("count orders: %w", err)
	}

	dataQuery += " ORDER BY created_at_utc DESC"
	limit := filter.GetLimit()
	offset := filter.GetOffset()
	dataQuery += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := s.pool.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list orders: %w", err)
	}
	defer rows.Close()

	orders := make([]Order, 0)
	for rows.Next() {
		var o Order
		if err := rows.Scan(&o.ID, &o.DisplayID, &o.BranchID, &o.personIDRaw, &o.clientUserIDRaw, &o.Status, &o.PriceTotal, &o.TotalItems,
			&o.Currency, &o.Notes, &o.DeletedAt, &o.CreatedAtUtc, &o.UpdatedAtUtc); err != nil {
			return nil, 0, fmt.Errorf("scan order: %w", err)
		}
		if o.personIDRaw != "" {
			parsed, parseErr := uuid.Parse(o.personIDRaw)
			if parseErr != nil {
				return nil, 0, fmt.Errorf("parse person id: %w", parseErr)
			}
			o.PersonID = &parsed
		}
		if o.clientUserIDRaw != "" {
			parsed, parseErr := uuid.Parse(o.clientUserIDRaw)
			if parseErr != nil {
				return nil, 0, fmt.Errorf("parse client user id: %w", parseErr)
			}
			o.ClientUserID = &parsed
		}
		orders = append(orders, o)
	}

	if len(orders) == 0 {
		return []OrderWithHistory{}, totalCount, nil
	}

	orderIDs := make([]uuid.UUID, len(orders))
	for i, o := range orders {
		orderIDs[i] = o.ID
	}

	historyRows, err := s.pool.Query(ctx, `
		SELECT id, order_id, from_status, to_status, COALESCE(changed_by_user_id::text, ''), notes, created_at_utc
		FROM order_status_history
		WHERE order_id = ANY($1::uuid[])
		ORDER BY created_at_utc
	`, orderIDs)
	if err != nil {
		return nil, 0, fmt.Errorf("batch get history: %w", err)
	}
	defer historyRows.Close()

	historyMap := make(map[uuid.UUID][]StatusHistoryEntry)
	for historyRows.Next() {
		var e StatusHistoryEntry
		var changedBy string
		if err := historyRows.Scan(&e.ID, &e.OrderID, &e.FromStatus, &e.ToStatus, &changedBy, &e.Notes, &e.CreatedAtUtc); err != nil {
			return nil, 0, fmt.Errorf("scan history: %w", err)
		}
		if changedBy != "" {
			parsed, parseErr := uuid.Parse(changedBy)
			if parseErr != nil {
				return nil, 0, fmt.Errorf("parse history user id: %w", parseErr)
			}
			e.ChangedByUserID = &parsed
		}
		historyMap[e.OrderID] = append(historyMap[e.OrderID], e)
	}

	result := make([]OrderWithHistory, len(orders))
	for i, o := range orders {
		result[i] = OrderWithHistory{
			Order:   o,
			History: historyMap[o.ID],
		}
		if result[i].History == nil {
			result[i].History = []StatusHistoryEntry{}
		}
	}

	return result, totalCount, nil
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, req UpdateOrderRequest) (*Order, error) {
	o, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if !IsEditable(o.Status) {
		editable, err := s.transRepo.GetEditableStatuses(ctx)
		if err != nil {
			return nil, fmt.Errorf("get editable statuses: %w", err)
		}
		if !editable[o.Status] {
			return nil, fmt.Errorf("ORDER_NOT_EDITABLE")
		}
	}

	if req.Items != nil {
		if len(req.Items) == 0 {
			return nil, fmt.Errorf("order must have at least one item")
		}
		for _, item := range req.Items {
			if item.ItemType != "product" && item.ItemType != "bundle" {
				return nil, fmt.Errorf("invalid item_type: %s", item.ItemType)
			}
			if item.ItemType == "product" && item.ProductID == uuid.Nil {
				return nil, fmt.Errorf("product_id is required for product items")
			}
			if item.ItemType == "bundle" && item.BundleID == uuid.Nil {
				return nil, fmt.Errorf("bundle_id is required for bundle items")
			}
			if item.ItemType == "product" {
				if err := s.validateItemPrice(ctx, item.ProductID, item.UnitPrice); err != nil {
					return nil, err
				}
			}
			if item.ItemType == "bundle" {
				if err := s.validateBundlePrice(ctx, item.BundleID, item.UnitPrice); err != nil {
					return nil, err
				}
			}
		}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if req.Notes != "" {
		_, err = tx.Exec(ctx, `UPDATE orders SET notes = $2, updated_at_utc = now() WHERE id = $1`, id, req.Notes)
		if err != nil {
			return nil, fmt.Errorf("update notes: %w", err)
		}
	}

	if req.Items != nil {
		if err := releaseBlockedStock(ctx, tx, o.Items); err != nil {
			return nil, err
		}

		_, err = tx.Exec(ctx, `DELETE FROM order_items WHERE order_id = $1`, id)
		if err != nil {
			return nil, fmt.Errorf("delete items: %w", err)
		}

		var priceTotal float64
		var totalItems int

		negativeStock, _ := s.sysCfg.GetNegativeStock(ctx)

		for _, item := range req.Items {
			subtotal := item.Quantity * item.UnitPrice
			priceTotal += subtotal
			totalItems += int(item.Quantity)

			var productID, bundleID *uuid.UUID
			if item.ItemType == "product" {
				productID = &item.ProductID

				var stock, stockAvailable, stockBlocked float64
				err = tx.QueryRow(ctx, `
					SELECT stock, stock_available, stock_blocked
					FROM products WHERE product_id = $1 FOR UPDATE
				`, item.ProductID).Scan(&stock, &stockAvailable, &stockBlocked)
				if err != nil {
					return nil, fmt.Errorf("get product stock: %w", err)
				}

				qty := item.Quantity
				if stockAvailable < qty && !negativeStock {
					return nil, fmt.Errorf("INSUFFICIENT_STOCK: product %s has %.4f available, requested %.4f", item.ProductID, stockAvailable, qty)
				}
				if stockBlocked+qty > stock {
					return nil, fmt.Errorf("STOCK_EXCEEDED: product %s stock=%.4f blocked=%.4f requested=%.4f", item.ProductID, stock, stockBlocked, qty)
				}

				_, err = tx.Exec(ctx, `
					UPDATE products
					SET stock_available = stock_available - $1, stock_blocked = stock_blocked + $1
					WHERE product_id = $2
				`, qty, item.ProductID)
				if err != nil {
					return nil, fmt.Errorf("update product stock: %w", err)
				}
			} else {
				bundleID = &item.BundleID
				var bundleStock, bundleAvailable, bundleBlocked float64
				var blocksProductStock bool
				err = tx.QueryRow(ctx, `
					SELECT stock, stock_available, stock_blocked, blocks_product_stock
					FROM bundles WHERE bundle_id = $1 FOR UPDATE
				`, item.BundleID).Scan(&bundleStock, &bundleAvailable, &bundleBlocked, &blocksProductStock)
				if err != nil {
					return nil, fmt.Errorf("get bundle stock: %w", err)
				}
				if blocksProductStock {
					qty := item.Quantity
					if bundleAvailable < qty && !negativeStock {
						return nil, fmt.Errorf("INSUFFICIENT_BUNDLE_STOCK: bundle %s has %.4f available, requested %.4f", item.BundleID, bundleAvailable, qty)
					}
					if bundleBlocked+qty > bundleStock {
						return nil, fmt.Errorf("BUNDLE_STOCK_EXCEEDED: bundle %s stock=%.4f blocked=%.4f requested=%.4f", item.BundleID, bundleStock, bundleBlocked, qty)
					}
					_, err = tx.Exec(ctx, `
						UPDATE bundles
						SET stock_available = stock_available - $1, stock_blocked = stock_blocked + $1
						WHERE bundle_id = $2
					`, qty, item.BundleID)
					if err != nil {
						return nil, fmt.Errorf("update bundle stock: %w", err)
					}

					if err := blockBundleProductStock(ctx, tx, item.BundleID, qty, negativeStock); err != nil {
						return nil, err
					}
				}
			}

			_, err = tx.Exec(ctx, `
				INSERT INTO order_items (id, order_id, item_type, product_id, bundle_id, quantity, unit_price, subtotal, currency)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'USD')
			`, uuid.New(), id, item.ItemType, productID, bundleID, item.Quantity, item.UnitPrice, subtotal)
			if err != nil {
				return nil, fmt.Errorf("insert order item: %w", err)
			}
		}

		_, err = tx.Exec(ctx, `UPDATE orders SET price_total = $2, total_items = $3, updated_at_utc = now() WHERE id = $1`, id, priceTotal, totalItems)
		if err != nil {
			return nil, fmt.Errorf("update totals: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return s.GetByID(ctx, id)
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID, changedByUserID uuid.UUID) error {
	o, err := s.GetByID(ctx, id)
	if err != nil {
		return err
	}

	if o.Status != StatusPendingReview {
		return fmt.Errorf("ORDER_CANNOT_BE_DELETED")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := releaseBlockedStock(ctx, tx, o.Items); err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `UPDATE orders SET deleted_at = now(), updated_at_utc = now() WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("soft delete order: %w", err)
	}

	return tx.Commit(ctx)
}

func (s *Service) ChangeStatus(ctx context.Context, id uuid.UUID, req StatusChangeRequest, changedByUserID uuid.UUID) (*Order, error) {
	// Validate transition using centralized method
	valid, err := s.GetValidTransitions(ctx, id)
	if err != nil {
		return nil, err
	}
	if valid.IsTerminal {
		return nil, fmt.Errorf("INVALID_TRANSITION")
	}

	targetAllowed := false
	for _, st := range valid.Statuses {
		if st.Code == req.ToStatus {
			targetAllowed = true
			break
		}
	}
	if !targetAllowed {
		return nil, fmt.Errorf("INVALID_TRANSITION")
	}

	// Find workflow edge for post-transition actions
	var activeEdge *workflow.WorkflowEdgeInfo
	wf, wfErr := s.wfReader.GetActiveWorkflow(ctx, "order")
	if wfErr == nil && wf != nil {
		for _, edge := range wf.Edges {
			if edge.SourceCode == valid.CurrentStatus && edge.TargetCode == req.ToStatus {
				activeEdge = &edge
				break
			}
		}
	}

	o, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if isStockReleaseStatus(req.ToStatus) {
		if err := releaseBlockedStock(ctx, tx, o.Items); err != nil {
			return nil, err
		}
	}

	if req.ToStatus == StatusCompleted {
		if err := completeOrderStock(ctx, tx, o.Items); err != nil {
			return nil, err
		}
	}

	_, err = tx.Exec(ctx, `UPDATE orders SET status = $2, updated_at_utc = now() WHERE id = $1`, id, req.ToStatus)
	if err != nil {
		return nil, fmt.Errorf("update status: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at_utc)
		VALUES ($1, $2, $3, $4, $5, $6, now())
	`, uuid.New(), id, valid.CurrentStatus, req.ToStatus, nullableUUID(&changedByUserID), nullString(req.Notes))
	if err != nil {
		return nil, fmt.Errorf("insert history: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	// Execute post-transition actions
	if activeEdge != nil {
		s.executeActions(ctx, o, activeEdge.Actions)
	}

	return s.GetByID(ctx, id)
}

func (s *Service) GetValidTransitions(ctx context.Context, orderID uuid.UUID) (*ValidTransitionsResponse, error) {
	o, err := s.GetByID(ctx, orderID)
	if err != nil {
		return nil, err
	}

	if IsTerminal(o.Status) {
		return &ValidTransitionsResponse{
			CurrentStatus: o.Status,
			IsTerminal:    true,
			Statuses:      []StatusOption{},
		}, nil
	}

	// Load active statuses for labels/colors
	activeStatusMap, err := s.loadActiveStatusMap(ctx)
	if err != nil {
		return nil, err
	}

	// Try workflow-based transitions
	wf, wfErr := s.wfReader.GetActiveWorkflow(ctx, "order")
	if wfErr == nil && wf != nil {
		return s.getWorkflowTransitions(ctx, o, wf, activeStatusMap)
	}

	// No workflow active — no transitions available
	return &ValidTransitionsResponse{
		CurrentStatus: o.Status,
		IsTerminal:    false,
		Statuses:      []StatusOption{},
	}, nil
}

func (s *Service) loadActiveStatusMap(ctx context.Context) (map[string]StatusOption, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT code, label, color FROM order_statuses WHERE is_active = true
	`)
	if err != nil {
		return nil, fmt.Errorf("load active statuses: %w", err)
	}
	defer rows.Close()

	m := make(map[string]StatusOption)
	for rows.Next() {
		var opt StatusOption
		if err := rows.Scan(&opt.Code, &opt.Label, &opt.Color); err != nil {
			return nil, fmt.Errorf("scan status: %w", err)
		}
		m[opt.Code] = opt
	}
	return m, nil
}

func (s *Service) getWorkflowTransitions(ctx context.Context, o *Order, wf *workflow.WorkflowInfo, activeMap map[string]StatusOption) (*ValidTransitionsResponse, error) {
	result := &ValidTransitionsResponse{
		CurrentStatus: o.Status,
		IsTerminal:    false,
		Statuses:      []StatusOption{},
	}

	for _, edge := range wf.Edges {
		if edge.SourceCode != o.Status {
			continue
		}
		// Only include if target is an active status
		targetOpt, isActive := activeMap[edge.TargetCode]
		if !isActive {
			continue
		}
		// Evaluate conditions — skip transition if conditions not met
		if len(edge.Conditions) > 0 {
			if err := s.evaluateConditions(ctx, o, edge.Conditions); err != nil {
				continue
			}
		}
		result.Statuses = append(result.Statuses, targetOpt)
	}

	return result, nil
}

func (s *Service) evaluateConditions(ctx context.Context, o *Order, conditions []workflow.WorkflowConditionInfo) error {
	for _, cond := range conditions {
		if err := s.evaluateCondition(ctx, o, cond); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) evaluateCondition(ctx context.Context, o *Order, cond workflow.WorkflowConditionInfo) error {
	var actual string
	switch cond.Field {
	case "total":
		actual = fmt.Sprintf("%.2f", o.PriceTotal)
	case "item_count":
		actual = fmt.Sprintf("%d", o.TotalItems)
	case "branch_id":
		actual = o.BranchID.String()
	case "notes":
		if o.Notes != nil {
			actual = *o.Notes
		}
	default:
		return nil
	}

	switch cond.Operator {
	case "equals":
		if actual != cond.Value {
			return fmt.Errorf("CONDITION_NOT_MET: %s", cond.Field)
		}
	case "not_equals":
		if actual == cond.Value {
			return fmt.Errorf("CONDITION_NOT_MET: %s", cond.Field)
		}
	case "contains":
		if !strings.Contains(actual, cond.Value) {
			return fmt.Errorf("CONDITION_NOT_MET: %s", cond.Field)
		}
	case "is_empty":
		if actual != "" {
			return fmt.Errorf("CONDITION_NOT_MET: %s", cond.Field)
		}
	case "is_not_empty":
		if actual == "" {
			return fmt.Errorf("CONDITION_NOT_MET: %s", cond.Field)
		}
	}
	return nil
}

func (s *Service) executeActions(ctx context.Context, o *Order, actions []workflow.WorkflowActionInfo) {
	for _, action := range actions {
		switch action.Type {
		case "send_email":
			// TODO: implement email sending
		case "webhook":
			// TODO: implement webhook call
		case "update_field":
			// TODO: implement field update
		}
	}
}

func (s *Service) GetHistory(ctx context.Context, orderID uuid.UUID) ([]StatusHistoryEntry, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, order_id, from_status, to_status, COALESCE(changed_by_user_id::text, ''), notes, created_at_utc
		FROM order_status_history WHERE order_id = $1 ORDER BY created_at_utc
	`, orderID)
	if err != nil {
		return nil, fmt.Errorf("get history: %w", err)
	}
	defer rows.Close()

	entries := make([]StatusHistoryEntry, 0)
	for rows.Next() {
		var e StatusHistoryEntry
		var changedBy string
		if err := rows.Scan(&e.ID, &e.OrderID, &e.FromStatus, &e.ToStatus, &changedBy, &e.Notes, &e.CreatedAtUtc); err != nil {
			return nil, fmt.Errorf("scan history: %w", err)
		}
		if changedBy != "" {
			parsed, parseErr := uuid.Parse(changedBy)
			if parseErr != nil {
				return nil, fmt.Errorf("parse history user id: %w", parseErr)
			}
			e.ChangedByUserID = &parsed
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func (s *Service) getItems(ctx context.Context, orderID uuid.UUID) ([]OrderItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, order_id, item_type, product_id, bundle_id, quantity, unit_price, subtotal, currency
		FROM order_items WHERE order_id = $1
	`, orderID)
	if err != nil {
		return nil, fmt.Errorf("get items: %w", err)
	}
	defer rows.Close()

	items := make([]OrderItem, 0)
	for rows.Next() {
		var i OrderItem
		if err := rows.Scan(&i.ID, &i.OrderID, &i.ItemType, &i.ProductID, &i.BundleID, &i.Quantity, &i.UnitPrice, &i.Subtotal, &i.Currency); err != nil {
			return nil, fmt.Errorf("scan item: %w", err)
		}
		items = append(items, i)
	}
	return items, nil
}

func nullString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func (s *Service) validateItemPrice(ctx context.Context, productID uuid.UUID, unitPrice float64) error {
	var count int
	err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM product_branch_prices WHERE product_id = $1
	`, productID).Scan(&count)
	if err != nil {
		return fmt.Errorf("check prices: %w", err)
	}
	if count == 0 {
		return nil
	}

	var exists bool
	err = s.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM product_branch_prices WHERE product_id = $1 AND amount = $2)
	`, productID, unitPrice).Scan(&exists)
	if err != nil {
		return fmt.Errorf("validate price: %w", err)
	}
	if !exists {
		return fmt.Errorf("PRICE_MISMATCH: product %s unit_price %.2f does not match any registered price", productID, unitPrice)
	}
	return nil
}

func (s *Service) validateBundlePrice(ctx context.Context, bundleID uuid.UUID, unitPrice float64) error {
	var count int
	err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM bundle_prices WHERE bundle_id = $1
	`, bundleID).Scan(&count)
	if err != nil {
		return fmt.Errorf("check bundle prices: %w", err)
	}
	if count == 0 {
		return nil
	}

	var exists bool
	err = s.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM bundle_prices WHERE bundle_id = $1 AND amount = $2)
	`, bundleID, unitPrice).Scan(&exists)
	if err != nil {
		return fmt.Errorf("validate bundle price: %w", err)
	}
	if !exists {
		return fmt.Errorf("PRICE_MISMATCH: bundle %s unit_price %.2f does not match any registered price", bundleID, unitPrice)
	}
	return nil
}

func (s *Service) resolveOrderIdentity(ctx context.Context, req CreateOrderRequest, actorUserID *uuid.UUID) (uuid.UUID, *uuid.UUID, error) {
	var resolvedPersonID uuid.UUID
	var resolvedClientUserID *uuid.UUID

	if req.ClientUserID != nil && strings.TrimSpace(*req.ClientUserID) != "" {
		if actorUserID == nil || *actorUserID == uuid.Nil {
			return uuid.Nil, nil, fmt.Errorf("CLIENT_USER_ID_REQUIRES_AUTH")
		}
		parsed, parseErr := uuid.Parse(strings.TrimSpace(*req.ClientUserID))
		if parseErr != nil {
			return uuid.Nil, nil, fmt.Errorf("invalid client_user_id")
		}
		if *actorUserID != parsed {
			return uuid.Nil, nil, fmt.Errorf("CLIENT_USER_ID_MISMATCH")
		}
		resolvedClientUserID = &parsed
	}
	if resolvedClientUserID == nil && actorUserID != nil && *actorUserID != uuid.Nil {
		resolvedClientUserID = actorUserID
	}

	if req.PersonID != nil && strings.TrimSpace(*req.PersonID) != "" {
		parsed, parseErr := uuid.Parse(strings.TrimSpace(*req.PersonID))
		if parseErr != nil {
			return uuid.Nil, nil, fmt.Errorf("invalid person_id")
		}
		if actorUserID == nil {
			return uuid.Nil, nil, fmt.Errorf("PERSON_ID_REQUIRES_AUTH")
		}
		ownerOK, ownerErr := s.userOwnsPerson(ctx, *actorUserID, parsed)
		if ownerErr != nil {
			return uuid.Nil, nil, ownerErr
		}
		if !ownerOK {
			return uuid.Nil, nil, fmt.Errorf("PERSON_OWNERSHIP_REQUIRED")
		}
		resolvedPersonID = parsed
	}

	if resolvedPersonID == uuid.Nil {
		if resolvedClientUserID != nil {
			personID, resolveErr := s.resolvePersonIDForUser(ctx, *resolvedClientUserID)
			if resolveErr != nil {
				return uuid.Nil, nil, resolveErr
			}
			if personID != uuid.Nil {
				resolvedPersonID = personID
			}
		}
		if resolvedPersonID == uuid.Nil {
			if actorUserID != nil {
				personID, createErr := s.resolveOrCreatePersonForUser(ctx, *actorUserID, req)
				if createErr != nil {
					return uuid.Nil, nil, createErr
				}
				resolvedPersonID = personID
			} else {
				personID, createErr := s.createGuestPerson(ctx, req)
				if createErr != nil {
					return uuid.Nil, nil, createErr
				}
				resolvedPersonID = personID
			}
		}
	}

	if resolvedPersonID == uuid.Nil {
		return uuid.Nil, nil, fmt.Errorf("PERSON_REQUIRED_FOR_ORDER")
	}

	return resolvedPersonID, resolvedClientUserID, nil
}

func (s *Service) resolvePersonIDForUser(ctx context.Context, userID uuid.UUID) (uuid.UUID, error) {
	var personIDStr string
	err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(person_id::text, '')
		FROM users
		WHERE id = $1
	`, userID).Scan(&personIDStr)
	if err == pgx.ErrNoRows {
		return uuid.Nil, fmt.Errorf("PERSON_REQUIRED_FOR_ORDER")
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("resolve user person: %w", err)
	}
	if personIDStr == "" {
		return uuid.Nil, fmt.Errorf("PERSON_REQUIRED_FOR_ORDER")
	}
	personID, err := uuid.Parse(personIDStr)
	if err != nil {
		return uuid.Nil, fmt.Errorf("resolve user person: %w", err)
	}
	return personID, nil
}

func (s *Service) userOwnsPerson(ctx context.Context, userID, personID uuid.UUID) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM users WHERE id = $1 AND person_id = $2
		)
	`, userID, personID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check person ownership: %w", err)
	}
	return exists, nil
}

func (s *Service) resolveOrCreatePersonForUser(ctx context.Context, userID uuid.UUID, req CreateOrderRequest) (uuid.UUID, error) {
	personID, err := s.resolvePersonIDForUser(ctx, userID)
	if err == nil && personID != uuid.Nil {
		return personID, nil
	}
	personID, err = s.createPersonFromOrderRequest(ctx, req)
	if err != nil {
		return uuid.Nil, err
	}
	if _, err := s.pool.Exec(ctx, `UPDATE users SET person_id = $2 WHERE id = $1`, userID, personID); err != nil {
		return uuid.Nil, fmt.Errorf("link person to user: %w", err)
	}
	return personID, nil
}

func (s *Service) createGuestPerson(ctx context.Context, req CreateOrderRequest) (uuid.UUID, error) {
	if req.PersonName == nil || req.PersonIdentityDocument == nil || req.PersonWhatsAppPhone == nil || req.PersonFullAddress == nil {
		return uuid.Nil, fmt.Errorf("PERSON_REQUIRED_FOR_ORDER")
	}
	var exists bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM persons WHERE identity_document = $1)`, strings.ToUpper(strings.TrimSpace(*req.PersonIdentityDocument))).Scan(&exists); err != nil {
		return uuid.Nil, fmt.Errorf("lookup person: %w", err)
	}
	if exists {
		return uuid.Nil, fmt.Errorf("PERSON_EXISTS")
	}
	return s.createPersonFromOrderRequest(ctx, req)
}

func (s *Service) createPersonFromOrderRequest(ctx context.Context, req CreateOrderRequest) (uuid.UUID, error) {
	name := strings.TrimSpace(valueOrEmpty(req.PersonName))
	doc := strings.ToUpper(strings.TrimSpace(valueOrEmpty(req.PersonIdentityDocument)))
	taxID := strings.TrimSpace(valueOrEmpty(req.PersonTaxID))
	phone := strings.TrimSpace(valueOrEmpty(req.PersonWhatsAppPhone))
	address := strings.TrimSpace(valueOrEmpty(req.PersonFullAddress))
	if name == "" || doc == "" || phone == "" || address == "" {
		return uuid.Nil, fmt.Errorf("PERSON_REQUIRED_FOR_ORDER")
	}
	var personID uuid.UUID
	err := s.pool.QueryRow(ctx, `
		INSERT INTO persons (id, name, identity_document, tax_id, whatsapp_phone, full_address, is_client, created_at_utc, updated_at_utc)
		VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, true, now(), now())
		RETURNING id
	`, uuid.New(), name, doc, taxID, phone, address).Scan(&personID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("create person: %w", err)
	}
	return personID, nil
}

func valueOrEmpty(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func nullableUUID(id *uuid.UUID) interface{} {
	if id == nil || *id == uuid.Nil {
		return nil
	}
	return *id
}

func isStockReleaseStatus(status string) bool {
	return status == StatusCancelledByCustomer || status == StatusRejectedByValidation
}

func blockBundleProductStock(ctx context.Context, tx pgx.Tx, bundleID uuid.UUID, bundleQty float64, negativeStock bool) error {
	rows, err := tx.Query(ctx, `
		SELECT product_id, quantity FROM bundle_items WHERE bundle_id = $1
	`, bundleID)
	if err != nil {
		return fmt.Errorf("get bundle items for stock block: %w", err)
	}
	type bundleItem struct {
		productID uuid.UUID
		qty       float64
	}
	var items []bundleItem
	for rows.Next() {
		var productID uuid.UUID
		var itemQty float64
		if scanErr := rows.Scan(&productID, &itemQty); scanErr != nil {
			rows.Close()
			return fmt.Errorf("scan bundle item for stock block: %w", scanErr)
		}
		items = append(items, bundleItem{productID: productID, qty: itemQty * bundleQty})
	}
	rows.Close()

	for _, bi := range items {
		if bi.qty > 0 {
			var stock, stockAvailable, stockBlocked float64
			err := tx.QueryRow(ctx, `
				SELECT stock, stock_available, stock_blocked
				FROM products WHERE product_id = $1 FOR UPDATE
			`, bi.productID).Scan(&stock, &stockAvailable, &stockBlocked)
			if err != nil {
				return fmt.Errorf("get product stock for bundle block: %w", err)
			}
			if stockAvailable < bi.qty && !negativeStock {
				return fmt.Errorf("INSUFFICIENT_STOCK: product %s has %.4f available, bundle needs %.4f", bi.productID, stockAvailable, bi.qty)
			}
			if stockBlocked+bi.qty > stock {
				return fmt.Errorf("STOCK_EXCEEDED: product %s stock=%.4f blocked=%.4f bundle needs %.4f", bi.productID, stock, stockBlocked, bi.qty)
			}
			_, err = tx.Exec(ctx, `
				UPDATE products
				SET stock_available = stock_available - $1, stock_blocked = stock_blocked + $1
				WHERE product_id = $2
			`, bi.qty, bi.productID)
			if err != nil {
				return fmt.Errorf("block product stock for bundle: %w", err)
			}
		}
	}
	return nil
}

func releaseBlockedStock(ctx context.Context, tx pgx.Tx, items []OrderItem) error {
	for _, item := range items {
		switch item.ItemType {
		case "product":
			if item.ProductID == nil {
				continue
			}
			qty := item.Quantity
			_, err := tx.Exec(ctx, `
				UPDATE products
				SET stock_available = stock_available + $1, stock_blocked = stock_blocked - $1
				WHERE product_id = $2
			`, qty, *item.ProductID)
			if err != nil {
				return fmt.Errorf("release stock for product %s: %w", *item.ProductID, err)
			}
		case "bundle":
			if item.BundleID == nil {
				continue
			}
			qty := item.Quantity
			var blocksProductStock bool
			err := tx.QueryRow(ctx, `
				SELECT blocks_product_stock FROM bundles WHERE bundle_id = $1 FOR UPDATE
			`, *item.BundleID).Scan(&blocksProductStock)
			if err != nil {
				continue
			}
			if blocksProductStock {
				_, err = tx.Exec(ctx, `
					UPDATE bundles
					SET stock_available = stock_available + $1, stock_blocked = stock_blocked - $1
					WHERE bundle_id = $2
				`, qty, *item.BundleID)
				if err != nil {
					return fmt.Errorf("release stock for bundle %s: %w", *item.BundleID, err)
				}

				bundleItems, qErr := tx.Query(ctx, `
					SELECT product_id, quantity FROM bundle_items WHERE bundle_id = $1
				`, *item.BundleID)
				if qErr != nil {
					return fmt.Errorf("get bundle items for release: %w", qErr)
				}
				type bundleItem struct {
					productID uuid.UUID
					qty       float64
				}
				var bItems []bundleItem
				for bundleItems.Next() {
					var productID uuid.UUID
					var itemQty float64
					if scanErr := bundleItems.Scan(&productID, &itemQty); scanErr != nil {
						bundleItems.Close()
						return fmt.Errorf("scan bundle item for release: %w", scanErr)
					}
					bItems = append(bItems, bundleItem{productID: productID, qty: itemQty * qty})
				}
				bundleItems.Close()
				for _, bi := range bItems {
					if bi.qty > 0 {
						_, updateErr := tx.Exec(ctx, `
							UPDATE products
							SET stock_available = stock_available + $1, stock_blocked = stock_blocked - $1
							WHERE product_id = $2
						`, bi.qty, bi.productID)
						if updateErr != nil {
							return fmt.Errorf("release product stock for %s: %w", bi.productID, updateErr)
						}
					}
				}
			}
		}
	}
	return nil
}

func completeOrderStock(ctx context.Context, tx pgx.Tx, items []OrderItem) error {
	for _, item := range items {
		switch item.ItemType {
		case "product":
			if item.ProductID == nil {
				continue
			}
			qty := item.Quantity
			// Permanently reduce stock + release blocked
			_, err := tx.Exec(ctx, `
				UPDATE products
				SET stock = stock - $1, stock_blocked = stock_blocked - $1
				WHERE product_id = $2
			`, qty, *item.ProductID)
			if err != nil {
				return fmt.Errorf("complete stock for product %s: %w", *item.ProductID, err)
			}
		case "bundle":
			if item.BundleID == nil {
				continue
			}
			qty := item.Quantity
			var blocksProductStock bool
			var bundleStock float64
			err := tx.QueryRow(ctx, `
				SELECT blocks_product_stock, stock FROM bundles WHERE bundle_id = $1 FOR UPDATE
			`, *item.BundleID).Scan(&blocksProductStock, &bundleStock)
			if err != nil {
				continue
			}
			if blocksProductStock {
				// Permanently reduce bundle stock + release blocked
				_, err = tx.Exec(ctx, `
					UPDATE bundles
					SET stock = stock - $1, stock_blocked = stock_blocked - $1
					WHERE bundle_id = $2
				`, qty, *item.BundleID)
				if err != nil {
					return fmt.Errorf("complete stock for bundle %s: %w", *item.BundleID, err)
				}

				// Reduce product stock proportionally
				bundleItems, qErr := tx.Query(ctx, `
					SELECT product_id, quantity FROM bundle_items WHERE bundle_id = $1
				`, *item.BundleID)
				if qErr != nil {
					return fmt.Errorf("get bundle items: %w", qErr)
				}
				type bundleItem struct {
					productID uuid.UUID
					qty       float64
				}
				var bItems []bundleItem
				for bundleItems.Next() {
					var productID uuid.UUID
					var itemQty float64
					if scanErr := bundleItems.Scan(&productID, &itemQty); scanErr != nil {
						bundleItems.Close()
						return fmt.Errorf("scan bundle item: %w", scanErr)
					}
					bItems = append(bItems, bundleItem{productID: productID, qty: itemQty * qty})
				}
				bundleItems.Close()
				for _, bi := range bItems {
					if bi.qty > 0 {
						_, updateErr := tx.Exec(ctx, `
							UPDATE products
							SET stock = stock - $1, stock_blocked = stock_blocked - $1
							WHERE product_id = $2
						`, bi.qty, bi.productID)
						if updateErr != nil {
							return fmt.Errorf("reduce product stock for %s: %w", bi.productID, updateErr)
						}
					}
				}
			}
		}
	}
	return nil
}
