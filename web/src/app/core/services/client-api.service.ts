import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import { PaginatedResponse } from '../models/pagination.model';
import {
  Client,
  ClientListFilter,
  ClientLookupResult,
  CreateClientRequest,
  UpdateClientRequest,
} from '../models/client.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface ClientGoData {
  id: string;
  name: string;
  identity_document: string;
  tax_id: string | null;
  whatsapp_phone: string;
  full_address: string;
  is_client: boolean;
  created_at_utc: string;
  updated_at_utc: string;
}

interface PaginatedGoData<T> {
  items: T[];
  total_count: number;
  limit: number;
  offset: number;
}

@Injectable({ providedIn: 'root' })
export class ClientApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  lookupByDocument(doc: string): Observable<ClientLookupResult> {
    return this.http
      .get<JsendEnvelope<ClientLookupResult>>(`${this.baseUrl}/api/v1/persons/lookup-by-document/${encodeURIComponent(doc)}`)
      .pipe(map((res) => res.data));
  }

  list(filter?: ClientListFilter): Observable<PaginatedResponse<Client>> {
    const params: Record<string, string> = {};
    if (filter?.limit != null) params['limit'] = String(filter.limit);
    if (filter?.offset != null) params['offset'] = String(filter.offset);
    if (filter?.search) params['search'] = filter.search;

    return this.http
      .get<JsendEnvelope<PaginatedGoData<ClientGoData>>>(`${this.baseUrl}/api/v1/persons/clients`, { params })
      .pipe(
        map((res) => ({
          items: res.data.items.map((c) => this.map(c)),
          totalCount: res.data.total_count,
          limit: res.data.limit,
          offset: res.data.offset,
        }))
      );
  }

  getById(id: string): Observable<Client> {
    return this.http
      .get<JsendEnvelope<ClientGoData>>(`${this.baseUrl}/api/v1/persons/clients/${id}`)
      .pipe(map((res) => this.map(res.data)));
  }

  create(req: CreateClientRequest): Observable<Client> {
    return this.http
      .post<JsendEnvelope<ClientGoData>>(`${this.baseUrl}/api/v1/persons/clients`, req, {
      })
      .pipe(map((res) => this.map(res.data)));
  }

  update(id: string, req: UpdateClientRequest): Observable<Client> {
    return this.http
      .put<JsendEnvelope<ClientGoData>>(`${this.baseUrl}/api/v1/persons/clients/${id}`, req, {
      })
      .pipe(map((res) => this.map(res.data)));
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(`${this.baseUrl}/api/v1/persons/clients/${id}`, {
      })
      .pipe(map(() => undefined));
  }

  private map(raw: ClientGoData): Client {
    return {
      id: raw.id,
      name: raw.name,
      identityDocument: raw.identity_document,
      taxId: raw.tax_id,
      whatsappPhone: raw.whatsapp_phone,
      fullAddress: raw.full_address,
      createdAtUtc: raw.created_at_utc,
      updatedAtUtc: raw.updated_at_utc,
    };
  }
}
