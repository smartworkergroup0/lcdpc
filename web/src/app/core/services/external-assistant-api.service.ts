import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import {
  AssistantLead,
  AssistantListFilter,
  AssistantOrder,
} from '../models/external-assistant.model';
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

interface LeadGoData {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  status: string;
  score: number;
  user_identification: string;
  address: string;
  is_processed: boolean;
  created_at: string;
  updated_at: string;
}

interface OrderGoData {
  id: string;
  customer_name: string;
  identification: string;
  address: string;
  summary: string;
  is_retention_agent: boolean;
  status: string;
  reference_number: string | null;
  reference_date: string | null;
  is_processed: boolean;
  created_at: string;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class ExternalAssistantApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string,
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  private mapLead(raw: LeadGoData): AssistantLead {
    return {
      id: raw.id,
      firstName: raw.first_name ?? '',
      lastName: raw.last_name ?? '',
      phone: raw.phone ?? '',
      email: raw.email ?? '',
      status: raw.status ?? '',
      score: raw.score ?? 0,
      userIdentification: raw.user_identification ?? '',
      address: raw.address ?? '',
      isProcessed: raw.is_processed ?? false,
      createdAt: raw.created_at ?? '',
      updatedAt: raw.updated_at ?? '',
    };
  }

  private mapOrder(raw: OrderGoData): AssistantOrder {
    return {
      id: raw.id,
      customerName: raw.customer_name ?? '',
      identification: raw.identification ?? '',
      address: raw.address ?? '',
      summary: raw.summary ?? '',
      isRetentionAgent: raw.is_retention_agent ?? false,
      status: raw.status ?? '',
      referenceNumber: raw.reference_number ?? null,
      referenceDate: raw.reference_date ?? null,
      isProcessed: raw.is_processed ?? false,
      createdAt: raw.created_at ?? '',
      updatedAt: raw.updated_at ?? '',
    };
  }

  listLeads(filter?: AssistantListFilter): Observable<PaginatedResponse<AssistantLead>> {
    const params: Record<string, string> = {};
    if (filter?.limit != null) params['limit'] = String(filter.limit);
    if (filter?.offset != null) params['offset'] = String(filter.offset);
    if (filter?.search) params['search'] = filter.search;
    if (filter?.status) params['status'] = filter.status;
    if (filter?.is_processed != null) params['is_processed'] = String(filter.is_processed);

    return this.http
      .get<JsendEnvelope<PaginatedGoData<LeadGoData>>>(
        `${this.baseUrl}/api/v1/external/assistant/leads`,
        { params },
      )
      .pipe(
        map((res) => ({
          items: res.data.items.map((item) => this.mapLead(item)),
          totalCount: res.data.total_count,
          limit: res.data.limit,
          offset: res.data.offset,
        })),
      );
  }

  listOrders(filter?: AssistantListFilter): Observable<PaginatedResponse<AssistantOrder>> {
    const params: Record<string, string> = {};
    if (filter?.limit != null) params['limit'] = String(filter.limit);
    if (filter?.offset != null) params['offset'] = String(filter.offset);
    if (filter?.search) params['search'] = filter.search;
    if (filter?.status) params['status'] = filter.status;
    if (filter?.is_processed != null) params['is_processed'] = String(filter.is_processed);

    return this.http
      .get<JsendEnvelope<PaginatedGoData<OrderGoData>>>(
        `${this.baseUrl}/api/v1/external/assistant/orders`,
        { params },
      )
      .pipe(
        map((res) => ({
          items: res.data.items.map((item) => this.mapOrder(item)),
          totalCount: res.data.total_count,
          limit: res.data.limit,
          offset: res.data.offset,
        })),
      );
  }

  getLeadByIdentification(identification: string): Observable<AssistantLead | null> {
    const params: Record<string, string> = { user_identification: identification };
    return this.http
      .get<JsendEnvelope<PaginatedGoData<LeadGoData>>>(
        `${this.baseUrl}/api/v1/external/assistant/leads`,
        { params },
      )
      .pipe(
        map((res) => {
          const items = res.data.items;
          return items.length > 0 ? this.mapLead(items[0]) : null;
        }),
      );
  }

  acceptOrder(orderId: string): Observable<void> {
    return this.http
      .post<JsendEnvelope<{ status: string }>>(
        `${this.baseUrl}/api/v1/external/assistant/orders/${orderId}/accept`,
        {},
      )
      .pipe(map(() => undefined));
  }

  rejectOrder(orderId: string): Observable<void> {
    return this.http
      .post<JsendEnvelope<{ status: string }>>(
        `${this.baseUrl}/api/v1/external/assistant/orders/${orderId}/reject`,
        {},
      )
      .pipe(map(() => undefined));
  }
}
