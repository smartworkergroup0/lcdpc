import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import {
  CreateWorkflowRequest,
  OrderStatus,
  OrderTransition,
  UpdateWorkflowRequest,
  Workflow,
  WorkflowFilter,
  WorkflowNode,
  WorkflowEdge,
  WorkflowMetadata,
} from '../models/workflow.model';
import { PaginatedResponse } from '../models/pagination.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface PaginatedGoData<T> {
  items: T[];
  total_count: number;
  limit: number;
  offset: number;
}

interface WorkflowGoData {
  id: string;
  name: string;
  version: string;
  description: string;
  entity_type: string;
  is_active: boolean;
  definition: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    metadata: WorkflowMetadata;
  };
  created_at_utc: string;
  updated_at_utc: string;
}

interface OrderStatusGoData {
  id: string;
  code: string;
  label: string;
  color: string;
  is_initial: boolean;
  is_final: boolean;
  description: string;
  sort_order: number;
}

interface OrderTransitionGoData {
  id: string;
  source_status_code: string;
  target_status_code: string;
  label: string;
  code: string;
  trigger_type: string;
  required_roles: string[];
  conditions: { field: string; operator: string; value: string }[];
  actions: { type: string; template_id?: string; url?: string }[];
  sort_order: number;
}

@Injectable({ providedIn: 'root' })
export class WorkflowApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  list(filter?: WorkflowFilter): Observable<PaginatedResponse<Workflow>> {
    const params: Record<string, string> = {};
    if (filter?.entity_type) params['entity_type'] = filter.entity_type;
    if (filter?.is_active != null) params['is_active'] = String(filter.is_active);
    if (filter?.limit != null) params['limit'] = String(filter.limit);
    if (filter?.offset != null) params['offset'] = String(filter.offset);

    return this.http
      .get<JsendEnvelope<PaginatedGoData<WorkflowGoData>>>(`${this.baseUrl}/api/v1/workflows/`, {
        params,
        withCredentials: true,
      })
      .pipe(
        map((res) => ({
          items: res.data.items.map((w) => this.mapWorkflow(w)),
          totalCount: res.data.total_count,
          limit: res.data.limit,
          offset: res.data.offset,
        }))
      );
  }

  getById(id: string): Observable<Workflow> {
    return this.http
      .get<JsendEnvelope<WorkflowGoData>>(`${this.baseUrl}/api/v1/workflows/${id}`, {
        withCredentials: true,
      })
      .pipe(map((res) => this.mapWorkflow(res.data)));
  }

  create(req: CreateWorkflowRequest): Observable<Workflow> {
    return this.http
      .post<JsendEnvelope<WorkflowGoData>>(`${this.baseUrl}/api/v1/workflows/`, req, {
        withCredentials: true,
      })
      .pipe(map((res) => this.mapWorkflow(res.data)));
  }

  update(id: string, req: UpdateWorkflowRequest): Observable<Workflow> {
    return this.http
      .put<JsendEnvelope<WorkflowGoData>>(`${this.baseUrl}/api/v1/workflows/${id}`, req, {
        withCredentials: true,
      })
      .pipe(map((res) => this.mapWorkflow(res.data)));
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(`${this.baseUrl}/api/v1/workflows/${id}`, {
        withCredentials: true,
      })
      .pipe(map(() => undefined));
  }

  deactivateStatus(code: string): Observable<{ deactivated: string; ordersReverted: number }> {
    return this.http
      .post<JsendEnvelope<{ deactivated: string; orders_reverted: number }>>(
        `${this.baseUrl}/api/v1/order-statuses/${code}/deactivate`,
        {},
        { withCredentials: true }
      )
      .pipe(
        map((res) => ({
          deactivated: res.data.deactivated,
          ordersReverted: res.data.orders_reverted,
        }))
      );
  }

  getOrderStatuses(): Observable<OrderStatus[]> {
    return this.http
      .get<JsendEnvelope<OrderStatusGoData[]>>(`${this.baseUrl}/api/v1/order-statuses`, {
        withCredentials: true,
      })
      .pipe(map((res) => res.data.map((s) => this.mapOrderStatus(s))));
  }

  getOrderTransitions(): Observable<OrderTransition[]> {
    return this.http
      .get<JsendEnvelope<OrderTransitionGoData[]>>(`${this.baseUrl}/api/v1/order-transitions`, {
        withCredentials: true,
      })
      .pipe(map((res) => res.data.map((t) => this.mapOrderTransition(t))));
  }

  private mapWorkflow(raw: WorkflowGoData): Workflow {
    return {
      id: raw.id,
      name: raw.name,
      version: raw.version,
      description: raw.description,
      entityType: raw.entity_type,
      isActive: raw.is_active,
      nodes: raw.definition.nodes,
      edges: raw.definition.edges,
      metadata: raw.definition.metadata,
      createdAtUtc: raw.created_at_utc,
      updatedAtUtc: raw.updated_at_utc,
    };
  }

  private mapOrderStatus(raw: OrderStatusGoData): OrderStatus {
    return {
      id: raw.id,
      code: raw.code,
      label: raw.label,
      color: raw.color,
      isInitial: raw.is_initial,
      isFinal: raw.is_final,
      description: raw.description,
      sortOrder: raw.sort_order,
    };
  }

  private mapOrderTransition(raw: OrderTransitionGoData): OrderTransition {
    return {
      id: raw.id,
      sourceStatusCode: raw.source_status_code,
      targetStatusCode: raw.target_status_code,
      label: raw.label,
      code: raw.code,
      triggerType: raw.trigger_type,
      requiredRoles: raw.required_roles,
      conditions: raw.conditions,
      actions: raw.actions,
      sortOrder: raw.sort_order,
    };
  }
}
