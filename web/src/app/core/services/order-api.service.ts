import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import { PaginatedResponse } from '../models/pagination.model';
import {
  CreateOrderRequest,
  MatrixFilter,
  Order,
  OrderFilter,
  OrderItem,
  OrderWithHistory,
  StatusChangeRequest,
  StatusHistoryEntry,
  UpdateOrderRequest,
} from '../models/order.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface OrderGoData {
  id: string;
  display_id: string;
  branch_id: string;
  person_id: string | null;
  client_user_id: string | null;
  status: string;
  price_total: number;
  total_items: number;
  currency: string;
  notes: string | null;
  deleted_at: string | null;
  created_at_utc: string;
  updated_at_utc: string;
  items?: OrderItemGoData[];
}

interface OrderItemGoData {
  id: string;
  order_id: string;
  item_type: string;
  product_id: string | null;
  bundle_id: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  currency: string;
}

interface PaginatedGoData<T> {
  items: T[];
  total_count: number;
  limit: number;
  offset: number;
}

interface StatusHistoryGoData {
  id: string;
  order_id: string;
  from_status: string | null;
  to_status: string;
  changed_by_user_id: string | null;
  notes: string | null;
  created_at_utc: string;
}

interface OrderWithHistoryGoData extends OrderGoData {
  history: StatusHistoryGoData[];
}

@Injectable({ providedIn: 'root' })
export class OrderApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  list(filter?: OrderFilter): Observable<PaginatedResponse<Order>> {
    const params: Record<string, string> = {};
    if (filter?.branch_id) params['branch_id'] = filter.branch_id;
    if (filter?.client_user_id) params['client_user_id'] = filter.client_user_id;
    if (filter?.person_id) params['person_id'] = filter.person_id;
    if (filter?.status) params['status'] = filter.status;
    if (filter?.display_id) params['display_id'] = filter.display_id;
    if (filter?.limit != null) params['limit'] = String(filter.limit);
    if (filter?.offset != null) params['offset'] = String(filter.offset);

    return this.http
      .get<JsendEnvelope<PaginatedGoData<OrderGoData>>>(`${this.baseUrl}/api/v1/orders/`, { params, withCredentials: true })
      .pipe(map((res) => ({
        items: res.data.items.map((o) => this.mapOrder(o)),
        totalCount: res.data.total_count,
        limit: res.data.limit,
        offset: res.data.offset,
      })));
  }

  listMatrix(filter?: MatrixFilter): Observable<{ items: OrderWithHistory[]; totalCount: number }> {
    const params: Record<string, string> = {};
    if (filter?.branch_id) params['branch_id'] = filter.branch_id;
    if (filter?.date_from) params['date_from'] = filter.date_from;
    if (filter?.date_to) params['date_to'] = filter.date_to;
    if (filter?.limit != null) params['limit'] = String(filter.limit);
    if (filter?.offset != null) params['offset'] = String(filter.offset);

    return this.http
      .get<JsendEnvelope<PaginatedGoData<OrderWithHistoryGoData>>>(`${this.baseUrl}/api/v1/orders/matrix`, { params, withCredentials: true })
      .pipe(map((res) => ({
        items: res.data.items.map((o) => this.mapOrderWithHistory(o)),
        totalCount: res.data.total_count,
      })));
  }

  getById(id: string): Observable<Order> {
    return this.http
      .get<JsendEnvelope<OrderGoData>>(`${this.baseUrl}/api/v1/orders/${id}`, {
        withCredentials: true,
      })
      .pipe(map((res) => this.mapOrder(res.data)));
  }

  getHistory(id: string): Observable<StatusHistoryEntry[]> {
    return this.http
      .get<JsendEnvelope<StatusHistoryGoData[]>>(
        `${this.baseUrl}/api/v1/orders/${id}/history`,
        { withCredentials: true }
      )
      .pipe(map((res) => res.data.map((h) => this.mapHistory(h))));
  }

  create(req: CreateOrderRequest): Observable<Order> {
    return this.http
      .post<JsendEnvelope<OrderGoData>>(`${this.baseUrl}/api/v1/orders/`, req, {
        withCredentials: true,
      })
      .pipe(map((res) => this.mapOrder(res.data)));
  }

  update(id: string, req: UpdateOrderRequest): Observable<Order> {
    return this.http
      .put<JsendEnvelope<OrderGoData>>(`${this.baseUrl}/api/v1/orders/${id}`, req, {
        withCredentials: true,
      })
      .pipe(map((res) => this.mapOrder(res.data)));
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(`${this.baseUrl}/api/v1/orders/${id}`, {
        withCredentials: true,
      })
      .pipe(map(() => undefined));
  }

  changeStatus(id: string, req: StatusChangeRequest): Observable<Order> {
    return this.http
      .post<JsendEnvelope<OrderGoData>>(
        `${this.baseUrl}/api/v1/orders/${id}/status`,
        req,
        { withCredentials: true }
      )
      .pipe(map((res) => this.mapOrder(res.data)));
  }

  private mapOrder(raw: OrderGoData): Order {
    return {
      id: raw.id,
      displayId: raw.display_id,
      branchId: raw.branch_id,
      personId: raw.person_id,
      clientUserId: raw.client_user_id,
      status: raw.status,
      priceTotal: raw.price_total,
      totalItems: raw.total_items,
      currency: raw.currency,
      notes: raw.notes,
      deletedAt: raw.deleted_at,
      createdAtUtc: raw.created_at_utc,
      updatedAtUtc: raw.updated_at_utc,
      items: raw.items?.map((i) => this.mapOrderItem(i)),
    };
  }

  private mapOrderItem(raw: OrderItemGoData): OrderItem {
    return {
      id: raw.id,
      orderId: raw.order_id,
      itemType: raw.item_type,
      productId: raw.product_id,
      bundleId: raw.bundle_id,
      quantity: raw.quantity,
      unitPrice: raw.unit_price,
      subtotal: raw.subtotal,
      currency: raw.currency,
    };
  }

  private mapHistory(raw: StatusHistoryGoData): StatusHistoryEntry {
    return {
      id: raw.id,
      orderId: raw.order_id,
      fromStatus: raw.from_status,
      toStatus: raw.to_status,
      changedByUserId: raw.changed_by_user_id,
      notes: raw.notes,
      createdAtUtc: raw.created_at_utc,
    };
  }

  private mapOrderWithHistory(raw: OrderWithHistoryGoData): OrderWithHistory {
    return {
      ...this.mapOrder(raw),
      history: (raw.history ?? []).map((h) => this.mapHistory(h)),
    };
  }
}
