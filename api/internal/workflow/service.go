package workflow

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) ListOrderStatuses(ctx context.Context, statusFilter string) ([]OrderStatus, error) {
	query := `
		SELECT id, code, label, color, is_initial, is_final, description, sort_order, created_at_utc, updated_at_utc
		FROM order_statuses
	`
	if statusFilter != "ALL" {
		query += " WHERE is_active = true"
	}
	query += " ORDER BY sort_order"

	rows, err := s.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list order statuses: %w", err)
	}
	defer rows.Close()

	statuses := make([]OrderStatus, 0)
	for rows.Next() {
		var st OrderStatus
		if err := rows.Scan(&st.ID, &st.Code, &st.Label, &st.Color, &st.IsInitial, &st.IsFinal,
			&st.Description, &st.SortOrder, &st.CreatedAtUtc, &st.UpdatedAtUtc); err != nil {
			return nil, fmt.Errorf("scan order status: %w", err)
		}
		statuses = append(statuses, st)
	}
	return statuses, nil
}

func (s *Service) ListOrderTransitions(ctx context.Context) ([]OrderTransition, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			t.id, t.source_status_id, t.target_status_id,
			s.code, e.code,
			t.label, t.code, t.trigger_type, t.required_roles, t.conditions, t.actions,
			t.sort_order, t.created_at_utc, t.updated_at_utc
		FROM order_transitions t
		JOIN order_statuses s ON s.id = t.source_status_id
		JOIN order_statuses e ON e.id = t.target_status_id
		ORDER BY t.sort_order
	`)
	if err != nil {
		return nil, fmt.Errorf("list order transitions: %w", err)
	}
	defer rows.Close()

	transitions := make([]OrderTransition, 0)
	for rows.Next() {
		var t OrderTransition
		var rolesJSON, condJSON, actJSON []byte
		if err := rows.Scan(
			&t.ID, &t.SourceStatusID, &t.TargetStatusID,
			&t.SourceCode, &t.TargetCode,
			&t.Label, &t.Code, &t.TriggerType, &rolesJSON, &condJSON, &actJSON,
			&t.SortOrder, &t.CreatedAtUtc, &t.UpdatedAtUtc,
		); err != nil {
			return nil, fmt.Errorf("scan order transition: %w", err)
		}
		if err := json.Unmarshal(rolesJSON, &t.RequiredRoles); err != nil {
			t.RequiredRoles = []string{}
		}
		if err := json.Unmarshal(condJSON, &t.Conditions); err != nil {
			t.Conditions = []TransitionCondition{}
		}
		if err := json.Unmarshal(actJSON, &t.Actions); err != nil {
			t.Actions = []TransitionAction{}
		}
		transitions = append(transitions, t)
	}
	return transitions, nil
}

// GetAllowedTransitions returns the allowed transitions as a map[from_code] -> []to_code.
func (s *Service) GetAllowedTransitions(ctx context.Context) (map[string][]string, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT s.code, e.code
		FROM order_transitions t
		JOIN order_statuses s ON s.id = t.source_status_id
		JOIN order_statuses e ON e.id = t.target_status_id
		WHERE s.is_active = true AND e.is_active = true
	`)
	if err != nil {
		return nil, fmt.Errorf("get allowed transitions: %w", err)
	}
	defer rows.Close()

	result := map[string][]string{}
	for rows.Next() {
		var from, to string
		if err := rows.Scan(&from, &to); err != nil {
			return nil, fmt.Errorf("scan transition: %w", err)
		}
		result[from] = append(result[from], to)
	}
	return result, nil
}

// GetTerminalStatuses returns status codes marked as final.
func (s *Service) GetTerminalStatuses(ctx context.Context) (map[string]bool, error) {
	rows, err := s.pool.Query(ctx, `SELECT code FROM order_statuses WHERE is_final = true`)
	if err != nil {
		return nil, fmt.Errorf("get terminal statuses: %w", err)
	}
	defer rows.Close()

	result := map[string]bool{}
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return nil, fmt.Errorf("scan terminal status: %w", err)
		}
		result[code] = true
	}
	return result, nil
}

// GetEditableStatuses returns status codes that allow order editing.
// Currently hardcoded as PENDING_REVIEW and UNDER_REVIEW.
func (s *Service) GetEditableStatuses(ctx context.Context) (map[string]bool, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT code FROM order_statuses
		WHERE code IN ('PENDING_REVIEW', 'UNDER_REVIEW')
	`)
	if err != nil {
		return nil, fmt.Errorf("get editable statuses: %w", err)
	}
	defer rows.Close()

	result := map[string]bool{}
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return nil, fmt.Errorf("scan editable status: %w", err)
		}
		result[code] = true
	}
	return result, nil
}

// GetActiveWorkflowRaw returns the active workflow for the given entity type, or nil if none exists.
func (s *Service) GetActiveWorkflowRaw(ctx context.Context, entityType string) (*Workflow, error) {
	var w Workflow
	var defJSON []byte
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, version, description, entity_type, is_active, definition, created_at_utc, updated_at_utc
		FROM workflows
		WHERE entity_type = $1 AND is_active = true
		ORDER BY created_at_utc DESC
		LIMIT 1
	`, entityType).Scan(&w.ID, &w.Name, &w.Version, &w.Description, &w.EntityType,
		&w.IsActive, &defJSON, &w.CreatedAtUtc, &w.UpdatedAtUtc)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get active workflow: %w", err)
	}
	if err := json.Unmarshal(defJSON, &w.Definition); err != nil {
		return nil, fmt.Errorf("unmarshal definition: %w", err)
	}
	return &w, nil
}

// FindEdgeForTransition finds the workflow edge that matches the given source and target status codes.
func FindEdgeForTransition(wf *Workflow, fromCode, toCode string) *WorkflowEdge {
	for _, edge := range wf.Definition.Edges {
		sourceNode := findNodeByID(wf, edge.Source)
		targetNode := findNodeByID(wf, edge.Target)
		if sourceNode != nil && targetNode != nil &&
			sourceNode.Data.Code == fromCode && targetNode.Data.Code == toCode {
			return &edge
		}
	}
	return nil
}

func findNodeByID(wf *Workflow, nodeID string) *WorkflowNode {
	for _, node := range wf.Definition.Nodes {
		if node.ID == nodeID {
			return &node
		}
	}
	return nil
}

// GetActiveWorkflow implements the WorkflowReader interface for the order package.
func (s *Service) GetActiveWorkflow(ctx context.Context, entityType string) (*WorkflowInfo, error) {
	wf, err := s.GetActiveWorkflowRaw(ctx, entityType)
	if err != nil {
		return nil, err
	}
	if wf == nil {
		return nil, nil
	}

	result := &WorkflowInfo{
		TerminalStatuses: make(map[string]bool),
	}

	// Build terminal statuses from nodes with IsFinal
	for _, node := range wf.Definition.Nodes {
		if node.Data.IsFinal {
			result.TerminalStatuses[node.Data.Code] = true
		}
	}

	for _, edge := range wf.Definition.Edges {
		sourceNode := findNodeByID(wf, edge.Source)
		targetNode := findNodeByID(wf, edge.Target)
		if sourceNode == nil || targetNode == nil {
			continue
		}
		conditions := make([]WorkflowConditionInfo, len(edge.Data.Rules.Conditions))
		for i, c := range edge.Data.Rules.Conditions {
			conditions[i] = WorkflowConditionInfo{
				Field:    c.Field,
				Operator: c.Operator,
				Value:    c.Value,
			}
		}
		actions := make([]WorkflowActionInfo, len(edge.Data.Actions))
		for i, a := range edge.Data.Actions {
			actions[i] = WorkflowActionInfo{
				Type:       a.Type,
				TemplateID: a.TemplateID,
				URL:        a.URL,
			}
		}
		result.Edges = append(result.Edges, WorkflowEdgeInfo{
			SourceCode:       sourceNode.Data.Code,
			TargetCode:       targetNode.Data.Code,
			TriggerType:      edge.Data.Rules.TriggerType,
			RequiredRoles:    edge.Data.Rules.RequiredRoles,
			Conditions:       conditions,
			Actions:          actions,
			AutoDelayMinutes: edge.Data.Rules.AutoDelayMinutes,
		})
	}
	return result, nil
}

func (s *Service) ListWorkflows(ctx context.Context, filter WorkflowFilter) ([]Workflow, int, error) {
	where := "WHERE 1=1"
	args := []interface{}{}
	argIdx := 1

	if filter.EntityType != nil {
		where += fmt.Sprintf(" AND entity_type = $%d", argIdx)
		args = append(args, *filter.EntityType)
		argIdx++
	}
	if filter.IsActive != nil {
		where += fmt.Sprintf(" AND is_active = $%d", argIdx)
		args = append(args, *filter.IsActive)
		argIdx++
	}

	var total int
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM workflows %s", where)
	if err := s.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count workflows: %w", err)
	}

	limit := filter.GetLimit()
	offset := filter.GetOffset()
	args = append(args, limit, offset)

	query := fmt.Sprintf(`
		SELECT id, name, version, description, entity_type, is_active, definition, created_at_utc, updated_at_utc
		FROM workflows %s
		ORDER BY created_at_utc DESC
		LIMIT $%d OFFSET $%d
	`, where, argIdx, argIdx+1)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list workflows: %w", err)
	}
	defer rows.Close()

	workflows := make([]Workflow, 0)
	for rows.Next() {
		var w Workflow
		var defJSON []byte
		if err := rows.Scan(&w.ID, &w.Name, &w.Version, &w.Description, &w.EntityType,
			&w.IsActive, &defJSON, &w.CreatedAtUtc, &w.UpdatedAtUtc); err != nil {
			return nil, 0, fmt.Errorf("scan workflow: %w", err)
		}
		if err := json.Unmarshal(defJSON, &w.Definition); err != nil {
			return nil, 0, fmt.Errorf("unmarshal definition: %w", err)
		}
		workflows = append(workflows, w)
	}
	return workflows, total, nil
}

func (s *Service) GetWorkflowByID(ctx context.Context, id uuid.UUID) (*Workflow, error) {
	var w Workflow
	var defJSON []byte
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, version, description, entity_type, is_active, definition, created_at_utc, updated_at_utc
		FROM workflows WHERE id = $1
	`, id).Scan(&w.ID, &w.Name, &w.Version, &w.Description, &w.EntityType,
		&w.IsActive, &defJSON, &w.CreatedAtUtc, &w.UpdatedAtUtc)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get workflow: %w", err)
	}
	if err := json.Unmarshal(defJSON, &w.Definition); err != nil {
		return nil, fmt.Errorf("unmarshal definition: %w", err)
	}
	return &w, nil
}

func (s *Service) CreateWorkflow(ctx context.Context, req CreateWorkflowRequest) (*Workflow, error) {
	defJSON, err := json.Marshal(req.Definition)
	if err != nil {
		return nil, fmt.Errorf("marshal definition: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Deactivate any existing active workflows for the same entity type
	_, err = tx.Exec(ctx, `
		UPDATE workflows SET is_active = false, updated_at_utc = now()
		WHERE entity_type = $1 AND is_active = true
	`, req.EntityType)
	if err != nil {
		return nil, fmt.Errorf("deactivate existing workflows: %w", err)
	}

	w := &Workflow{}
	err = tx.QueryRow(ctx, `
		INSERT INTO workflows (id, name, version, description, entity_type, is_active, definition, created_at_utc, updated_at_utc)
		VALUES ($1, $2, '1.0', $3, $4, true, $5, now(), now())
		RETURNING id, name, version, description, entity_type, is_active, definition, created_at_utc, updated_at_utc
	`, uuid.New(), req.Name, req.Description, req.EntityType, defJSON).Scan(
		&w.ID, &w.Name, &w.Version, &w.Description, &w.EntityType,
		&w.IsActive, &defJSON, &w.CreatedAtUtc, &w.UpdatedAtUtc,
	)
	if err != nil {
		return nil, fmt.Errorf("insert workflow: %w", err)
	}
	if err := json.Unmarshal(defJSON, &w.Definition); err != nil {
		return nil, fmt.Errorf("unmarshal definition: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	// Activate order statuses referenced by workflow nodes
	if err := s.activateWorkflowStatuses(ctx, req.Definition); err != nil {
		return nil, err
	}

	return w, nil
}

func (s *Service) UpdateWorkflow(ctx context.Context, id uuid.UUID, req UpdateWorkflowRequest) (*Workflow, error) {
	defJSON, err := json.Marshal(req.Definition)
	if err != nil {
		return nil, fmt.Errorf("marshal definition: %w", err)
	}

	setClauses := "definition = $2, updated_at_utc = now()"
	args := []interface{}{id, defJSON}
	argIdx := 3

	if req.Name != nil {
		setClauses += fmt.Sprintf(", name = $%d", argIdx)
		args = append(args, *req.Name)
		argIdx++
	}
	if req.Description != nil {
		setClauses += fmt.Sprintf(", description = $%d", argIdx)
		args = append(args, *req.Description)
		argIdx++
	}

	query := fmt.Sprintf(`
		UPDATE workflows SET %s WHERE id = $1
		RETURNING id, name, version, description, entity_type, is_active, definition, created_at_utc, updated_at_utc
	`, setClauses)

	w := &Workflow{}
	err = s.pool.QueryRow(ctx, query, args...).Scan(
		&w.ID, &w.Name, &w.Version, &w.Description, &w.EntityType,
		&w.IsActive, &defJSON, &w.CreatedAtUtc, &w.UpdatedAtUtc,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("update workflow: %w", err)
	}
	if err := json.Unmarshal(defJSON, &w.Definition); err != nil {
		return nil, fmt.Errorf("unmarshal definition: %w", err)
	}

	// Activate order statuses referenced by workflow nodes
	if err := s.activateWorkflowStatuses(ctx, req.Definition); err != nil {
		return nil, err
	}

	return w, nil
}

func (s *Service) DeleteWorkflow(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM workflows WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete workflow: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("NOT_FOUND")
	}
	return nil
}

func (s *Service) activateWorkflowStatuses(ctx context.Context, definition Definition) error {
	if len(definition.Nodes) == 0 {
		return nil
	}
	codes := make([]string, 0, len(definition.Nodes))
	for _, node := range definition.Nodes {
		if node.Data.Code != "" {
			codes = append(codes, node.Data.Code)
		}
	}
	if len(codes) == 0 {
		return nil
	}
	_, err := s.pool.Exec(ctx, `
		UPDATE order_statuses SET is_active = true, updated_at_utc = now()
		WHERE code = ANY($1)
	`, codes)
	if err != nil {
		return fmt.Errorf("activate workflow statuses: %w", err)
	}
	return nil
}

// DeactivateStatus deactivates a status and reverts orders to their previous status.
// Idempotent: if the status is already deactivated, returns success with ordersReverted=0.
func (s *Service) DeactivateStatus(ctx context.Context, code string) (*DeactivateStatusResponse, error) {
	// Check if status exists (regardless of is_active)
	var isActive bool
	err := s.pool.QueryRow(ctx, `SELECT is_active FROM order_statuses WHERE code = $1`, code).Scan(&isActive)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("STATUS_NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("check status exists: %w", err)
	}

	// Already deactivated — idempotent success
	if !isActive {
		return &DeactivateStatusResponse{
			Deactivated:    code,
			OrdersReverted: 0,
		}, nil
	}

	// Determine if status is terminal from workflow isFinal flag
	isTerminal := false
	wf, wfErr := s.GetActiveWorkflow(ctx, "order")
	if wfErr == nil && wf != nil {
		isTerminal = wf.TerminalStatuses[code]
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Deactivate the status
	_, err = tx.Exec(ctx, `UPDATE order_statuses SET is_active = false, updated_at_utc = now() WHERE code = $1`, code)
	if err != nil {
		return nil, fmt.Errorf("deactivate status: %w", err)
	}

	ordersReverted := 0

	// Revert orders if not terminal status
	if !isTerminal {
		// Find all active orders with this status
		rows, err := tx.Query(ctx, `
			SELECT id FROM orders 
			WHERE status = $1 AND deleted_at IS NULL
		`, code)
		if err != nil {
			return nil, fmt.Errorf("find orders: %w", err)
		}

		var orderIDs []uuid.UUID
		for rows.Next() {
			var id uuid.UUID
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return nil, fmt.Errorf("scan order id: %w", err)
			}
			orderIDs = append(orderIDs, id)
		}
		rows.Close()

		for _, orderID := range orderIDs {
			// Get previous status from history
			var prevStatus string
			err := tx.QueryRow(ctx, `
				SELECT from_status FROM order_status_history 
				WHERE order_id = $1 AND to_status = $2
				ORDER BY created_at_utc DESC LIMIT 1
			`, orderID, code).Scan(&prevStatus)

			if err != nil || prevStatus == "" {
				// Fallback to PENDING_REVIEW
				prevStatus = "PENDING_REVIEW"
			}

			// Update order status
			_, err = tx.Exec(ctx, `
				UPDATE orders SET status = $2, updated_at_utc = now(), status_changed_at = now() WHERE id = $1
			`, orderID, prevStatus)
			if err != nil {
				return nil, fmt.Errorf("update order status: %w", err)
			}

			// Insert history record
			_, err = tx.Exec(ctx, `
				INSERT INTO order_status_history (id, order_id, from_status, to_status, notes, created_at_utc)
				VALUES ($1, $2, $3, $4, $5, now())
			`, uuid.New(), orderID, code, prevStatus, fmt.Sprintf("Status '%s' deactivated, reverted to '%s'", code, prevStatus))
			if err != nil {
				return nil, fmt.Errorf("insert history: %w", err)
			}

			ordersReverted++
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return &DeactivateStatusResponse{
		Deactivated:    code,
		OrdersReverted: ordersReverted,
	}, nil
}
