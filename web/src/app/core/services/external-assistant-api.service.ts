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

@Injectable({ providedIn: 'root' })
export class ExternalAssistantApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string,
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  listLeads(filter?: AssistantListFilter): Observable<PaginatedResponse<AssistantLead>> {
    const params: Record<string, string> = {};
    if (filter?.limit != null) params['limit'] = String(filter.limit);
    if (filter?.offset != null) params['offset'] = String(filter.offset);
    if (filter?.search) params['search'] = filter.search;
    if (filter?.status) params['status'] = filter.status;
    if (filter?.is_processed != null) params['is_processed'] = String(filter.is_processed);

    return this.http
      .get<JsendEnvelope<PaginatedGoData<AssistantLead>>>(
        `${this.baseUrl}/api/v1/external/assistant/leads`,
        { params },
      )
      .pipe(
        map((res) => ({
          items: res.data.items,
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
      .get<JsendEnvelope<PaginatedGoData<AssistantOrder>>>(
        `${this.baseUrl}/api/v1/external/assistant/orders`,
        { params },
      )
      .pipe(
        map((res) => ({
          items: res.data.items,
          totalCount: res.data.total_count,
          limit: res.data.limit,
          offset: res.data.offset,
        })),
      );
  }
}
