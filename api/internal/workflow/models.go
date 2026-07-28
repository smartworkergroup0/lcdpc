package workflow

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type OrderStatus struct {
	ID          uuid.UUID `json:"id"`
	Code        string    `json:"code"`
	Label       string    `json:"label"`
	Color       string    `json:"color"`
	IsInitial   bool      `json:"is_initial"`
	IsFinal     bool      `json:"is_final"`
	Description string    `json:"description"`
	SortOrder   int       `json:"sort_order"`
	CreatedAtUtc time.Time `json:"created_at_utc"`
	UpdatedAtUtc time.Time `json:"updated_at_utc"`
}

type TransitionCondition struct {
	Field    string `json:"field"`
	Operator string `json:"operator"`
	Value    string `json:"value"`
}

type TransitionAction struct {
	Type       string  `json:"type"`
	TemplateID *string `json:"template_id,omitempty"`
	URL        *string `json:"url,omitempty"`
}

type OrderTransition struct {
	ID             uuid.UUID             `json:"id"`
	SourceStatusID uuid.UUID             `json:"source_status_id"`
	TargetStatusID uuid.UUID             `json:"target_status_id"`
	SourceCode     string                `json:"source_status_code"`
	TargetCode     string                `json:"target_status_code"`
	Label          string                `json:"label"`
	Code           string                `json:"code"`
	TriggerType    string                `json:"trigger_type"`
	RequiredRoles  []string              `json:"required_roles"`
	Conditions     []TransitionCondition `json:"conditions"`
	Actions        []TransitionAction    `json:"actions"`
	SortOrder      int                   `json:"sort_order"`
	CreatedAtUtc   time.Time             `json:"created_at_utc"`
	UpdatedAtUtc   time.Time             `json:"updated_at_utc"`
}

type Workflow struct {
	ID          uuid.UUID    `json:"id"`
	Name        string       `json:"name"`
	Version     string       `json:"version"`
	Description string       `json:"description"`
	EntityType  string       `json:"entity_type"`
	IsActive    bool         `json:"is_active"`
	Definition  Definition   `json:"definition"`
	CreatedAtUtc time.Time   `json:"created_at_utc"`
	UpdatedAtUtc time.Time   `json:"updated_at_utc"`
}

type Definition struct {
	Nodes    []WorkflowNode    `json:"nodes"`
	Edges    []WorkflowEdge    `json:"edges"`
	Metadata WorkflowMetadata  `json:"metadata"`
}

type WorkflowNode struct {
	ID       string         `json:"id"`
	Type     string         `json:"type"`
	Position Position       `json:"position"`
	Data     WorkflowNodeData `json:"data"`
}

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type WorkflowNodeData struct {
	Label       string  `json:"label"`
	Code        string  `json:"code"`
	IsInitial   bool    `json:"is_initial"`
	IsFinal     bool    `json:"is_final"`
	Color       string  `json:"color,omitempty"`
	Description string  `json:"description,omitempty"`
}

type WorkflowEdge struct {
	ID     string           `json:"id"`
	Source string           `json:"source"`
	Target string           `json:"target"`
	Data   WorkflowEdgeData `json:"data"`
}

type WorkflowEdgeData struct {
	Label  string          `json:"label"`
	Code   string          `json:"code"`
	Rules  TransitionRules  `json:"rules"`
	Actions []TransitionAction `json:"actions"`
}

type TransitionRules struct {
	TriggerType      string                `json:"trigger_type"`
	RequiredRoles    []string              `json:"required_roles"`
	Conditions       []TransitionCondition `json:"conditions"`
	AutoDelayMinutes *int                  `json:"auto_delay_minutes,omitempty"`
}

type WorkflowMetadata struct {
	Viewport  Viewport `json:"viewport"`
	CreatedAt string   `json:"created_at"`
	UpdatedAt string   `json:"updated_at"`
}

type Viewport struct {
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Zoom float64 `json:"zoom"`
}

type CreateWorkflowRequest struct {
	Name       string     `json:"name" validate:"required"`
	Description string    `json:"description"`
	EntityType string     `json:"entity_type" validate:"required"`
	Definition Definition `json:"definition" validate:"required"`
}

type UpdateWorkflowRequest struct {
	Name       *string     `json:"name,omitempty"`
	Description *string    `json:"description,omitempty"`
	Definition Definition  `json:"definition" validate:"required"`
}

type WorkflowFilter struct {
	EntityType *string
	IsActive   *bool
	Limit      int
	Offset     int
}

const DefaultLimit = 10
const MaxLimit = 100

func (f WorkflowFilter) GetLimit() int {
	if f.Limit <= 0 {
		return DefaultLimit
	}
	if f.Limit > MaxLimit {
		return MaxLimit
	}
	return f.Limit
}

func (f WorkflowFilter) GetOffset() int {
	if f.Offset < 0 {
		return 0
	}
	return f.Offset
}

// Types for order package integration (avoids circular dependency)

type WorkflowConditionInfo struct {
	Field    string `json:"field"`
	Operator string `json:"operator"`
	Value    string `json:"value"`
}

type WorkflowActionInfo struct {
	Type       string  `json:"type"`
	TemplateID *string `json:"template_id,omitempty"`
	URL        *string `json:"url,omitempty"`
}

type WorkflowEdgeInfo struct {
	SourceCode       string
	TargetCode       string
	TriggerType      string
	RequiredRoles    []string
	Conditions       []WorkflowConditionInfo
	Actions          []WorkflowActionInfo
	AutoDelayMinutes *int
}

type WorkflowInfo struct {
	Edges           []WorkflowEdgeInfo
	TerminalStatuses map[string]bool
}

type DeactivateStatusResponse struct {
	Deactivated    string `json:"deactivated"`
	OrdersReverted int    `json:"orders_reverted"`
}

// WorkflowReader is the interface that the order package depends on.
type WorkflowReader interface {
	GetActiveWorkflow(ctx context.Context, entityType string) (*WorkflowInfo, error)
}
