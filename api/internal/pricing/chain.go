package pricing

import (
	"context"
	"fmt"
	"math"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type ChainItem struct {
	ProductID uuid.UUID
	Quantity  float64
}

func MaxBundleStock(ctx context.Context, tx pgx.Tx, items []ChainItem) (float64, error) {
	minStock := -1.0
	for _, item := range items {
		var stockAvailable float64
		err := tx.QueryRow(ctx, `
			SELECT stock_available FROM products WHERE product_id = $1 FOR UPDATE
		`, item.ProductID).Scan(&stockAvailable)
		if err != nil {
			return 0, fmt.Errorf("get product stock for %s: %w", item.ProductID, err)
		}
		qty := item.Quantity
		if qty <= 0 {
			continue
		}
		canMake := math.Floor(stockAvailable / qty)
		if minStock < 0 || canMake < minStock {
			minStock = canMake
		}
	}
	if minStock < 0 {
		return 0, nil
	}
	return minStock, nil
}

func BlockProductStock(ctx context.Context, tx pgx.Tx, items []ChainItem, bundleStock float64) error {
	for _, item := range items {
		blockQty := item.Quantity * bundleStock
		if blockQty <= 0 {
			continue
		}
		_, err := tx.Exec(ctx, `
			UPDATE products
			SET stock_available = stock_available - $1, stock_blocked = stock_blocked + $1
			WHERE product_id = $2
		`, blockQty, item.ProductID)
		if err != nil {
			return fmt.Errorf("block stock for product %s: %w", item.ProductID, err)
		}
	}
	return nil
}

func ReleaseProductStock(ctx context.Context, tx pgx.Tx, items []ChainItem, bundleStock float64) error {
	for _, item := range items {
		releaseQty := item.Quantity * bundleStock
		if releaseQty <= 0 {
			continue
		}
		_, err := tx.Exec(ctx, `
			UPDATE products
			SET stock_available = stock_available + $1, stock_blocked = stock_blocked - $1
			WHERE product_id = $2
		`, releaseQty, item.ProductID)
		if err != nil {
			return fmt.Errorf("release stock for product %s: %w", item.ProductID, err)
		}
	}
	return nil
}

func toChainItems(items []BundleItem) []ChainItem {
	ci := make([]ChainItem, len(items))
	for i, item := range items {
		ci[i] = ChainItem{ProductID: item.ProductID, Quantity: item.Quantity}
	}
	return ci
}
