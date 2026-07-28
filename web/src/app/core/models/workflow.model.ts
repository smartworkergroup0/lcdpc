export interface WorkflowNodeData {
  label: string;
  code: string;
  isInitial: boolean;
  isFinal: boolean;
  color?: string;
  description?: string;
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface TransitionCondition {
  field: string;
  operator: string;
  value: string;
}

export interface TransitionAction {
  type: string;
  templateId?: string;
  url?: string;
}

export interface TransitionRules {
  triggerType: 'manual' | 'automatic' | 'webhook';
  requiredRoles: string[];
  conditions: TransitionCondition[];
  autoDelayMinutes?: number;
}

export interface WorkflowEdgeData {
  label: string;
  code: string;
  rules: TransitionRules;
  actions: TransitionAction[];
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  data: WorkflowEdgeData;
}

export interface WorkflowViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface WorkflowMetadata {
  viewport: WorkflowViewport;
  createdAt: string;
  updatedAt: string;
}

export interface Workflow {
  id: string;
  name: string;
  version: string;
  description: string;
  entityType: string;
  isActive: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata: WorkflowMetadata;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface CreateWorkflowRequest {
  name: string;
  description: string;
  entity_type: string;
  definition: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    metadata: WorkflowMetadata;
  };
}

export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
  definition: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    metadata: WorkflowMetadata;
  };
}

export interface WorkflowFilter {
  entity_type?: string;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

export interface OrderStatus {
  id: string;
  code: string;
  label: string;
  color: string;
  isInitial: boolean;
  isFinal: boolean;
  description: string;
  sortOrder: number;
}

export interface OrderTransition {
  id: string;
  sourceStatusCode: string;
  targetStatusCode: string;
  label: string;
  code: string;
  triggerType: string;
  requiredRoles: string[];
  conditions: TransitionCondition[];
  actions: TransitionAction[];
  sortOrder: number;
}
