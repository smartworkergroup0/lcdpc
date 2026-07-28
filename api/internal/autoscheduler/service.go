package autoscheduler

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lcdpc/lcdpc-go/internal/workflow"
)

type OrderChanger interface {
	AutoChangeStatus(ctx context.Context, orderID uuid.UUID, toStatus string, notes string) error
}

type WorkflowReader interface {
	GetActiveWorkflow(ctx context.Context, entityType string) (*workflow.WorkflowInfo, error)
}

type Service struct {
	pool     *pgxpool.Pool
	wfReader WorkflowReader
	orderSvc OrderChanger
}

func NewService(pool *pgxpool.Pool, wfReader WorkflowReader, orderSvc OrderChanger) *Service {
	return &Service{
		pool:     pool,
		wfReader: wfReader,
		orderSvc: orderSvc,
	}
}

func (s *Service) Start(ctx context.Context) {
	slog.Info("autoscheduler starting")
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.processPending(ctx)
		case <-ctx.Done():
			slog.Info("autoscheduler stopped")
			return
		}
	}
}

func (s *Service) processPending(ctx context.Context) {
	wf, err := s.wfReader.GetActiveWorkflow(ctx, "order")
	if err != nil {
		slog.Error("autoscheduler: failed to get active workflow", "error", err)
		return
	}
	if wf == nil {
		return
	}

	for _, edge := range wf.Edges {
		if edge.TriggerType != "automatic" || edge.AutoDelayMinutes == nil || *edge.AutoDelayMinutes <= 0 {
			continue
		}

		autoDelayMinutes := *edge.AutoDelayMinutes
		notes := fmt.Sprintf("Transición automática después de %d minutos", autoDelayMinutes)

		s.processEdge(ctx, edge.SourceCode, edge.TargetCode, autoDelayMinutes, notes)
	}
}

func (s *Service) processEdge(ctx context.Context, sourceStatus, targetStatus string, autoDelayMinutes int, notes string) {
	query := `
		SELECT id FROM orders
		WHERE status = $1
		  AND status_changed_at <= now() - make_interval(mins => $2)
		  AND deleted_at IS NULL
		ORDER BY status_changed_at
		LIMIT 50
	`

	rows, err := s.pool.Query(ctx, query, sourceStatus, autoDelayMinutes)
	if err != nil {
		slog.Error("autoscheduler: failed to query orders", "source", sourceStatus, "error", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var orderID uuid.UUID
		if err := rows.Scan(&orderID); err != nil {
			slog.Error("autoscheduler: failed to scan order id", "error", err)
			continue
		}

		if err := s.orderSvc.AutoChangeStatus(ctx, orderID, targetStatus, notes); err != nil {
			slog.Error("autoscheduler: failed to change status",
				"order_id", orderID.String(),
				"from", sourceStatus,
				"to", targetStatus,
				"error", err,
			)
			continue
		}

		slog.Info("autoscheduler: order transitioned",
			"order_id", orderID.String(),
			"from", sourceStatus,
			"to", targetStatus,
		)
	}
}
