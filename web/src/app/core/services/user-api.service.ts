import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import { AppUser } from '../models/user.model';
import { PaginatedResponse } from '../models/pagination.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface UserGoData {
  id: string;
  email: string;
  person_id: string | null;
  name: string | null;
  identity_document: string | null;
  whatsapp_phone: string | null;
  full_address: string | null;
  is_client: boolean | null;
  status: string;
  created_at_utc: string;
}

interface PaginatedGoData<T> {
  items: T[];
  total_count: number;
  limit: number;
  offset: number;
}

@Injectable({ providedIn: 'root' })
export class UserApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  search(query: string, limit = 10, offset = 0): Observable<PaginatedResponse<AppUser>> {
    return this.http
      .get<JsendEnvelope<PaginatedGoData<UserGoData>>>(`${this.baseUrl}/api/v1/users/search`, {
        params: { q: query, limit: String(limit), offset: String(offset) },
      })
      .pipe(map((res) => ({
        items: res.data.items.map((u) => this.map(u)),
        totalCount: res.data.total_count,
        limit: res.data.limit,
        offset: res.data.offset,
      })));
  }

  getByDocument(document: string): Observable<AppUser> {
    return this.http
      .get<JsendEnvelope<UserGoData>>(`${this.baseUrl}/api/v1/users/by-document/${encodeURIComponent(document)}`, {
      })
      .pipe(map((res) => this.map(res.data)));
  }

  getById(id: string): Observable<AppUser> {
    return this.http
      .get<JsendEnvelope<UserGoData>>(`${this.baseUrl}/api/v1/users/${id}`)
      .pipe(map((res) => this.map(res.data)));
  }

  update(id: string, req: { email: string; name: string; whatsapp_phone: string; full_address: string }): Observable<AppUser> {
    return this.http
      .put<JsendEnvelope<UserGoData>>(`${this.baseUrl}/api/v1/users/${id}`, req)
      .pipe(map((res) => this.map(res.data)));
  }

  list(filter?: { limit?: number; offset?: number }): Observable<PaginatedResponse<AppUser>> {
    const params: Record<string, string> = {};
    if (filter?.limit != null) params['limit'] = String(filter.limit);
    if (filter?.offset != null) params['offset'] = String(filter.offset);

    return this.http
      .get<JsendEnvelope<PaginatedGoData<UserGoData>>>(`${this.baseUrl}/api/v1/users/`, {
        params,
      })
      .pipe(map((res) => ({
        items: res.data.items.map((u) => this.map(u)),
        totalCount: res.data.total_count,
        limit: res.data.limit,
        offset: res.data.offset,
      })));
  }

  private map(raw: UserGoData): AppUser {
    return {
      id: raw.id,
      email: raw.email,
      personId: raw.person_id,
      name: raw.name,
      identityDocument: raw.identity_document,
      whatsappPhone: raw.whatsapp_phone,
      fullAddress: raw.full_address,
      isClient: raw.is_client,
      status: raw.status,
      createdAtUtc: raw.created_at_utc,
    };
  }
}
