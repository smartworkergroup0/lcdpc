import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import {
  ApiToken,
  CreateApiTokenRequest,
  CreateApiTokenResult,
  UpdateApiTokenRequest,
} from '../models/api-token.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface ApiTokenGoData {
  id: string;
  name: string;
  is_active: boolean;
  created_at_utc: string;
}

interface CreateApiTokenGoResult extends ApiTokenGoData {
  raw_token: string;
}

@Injectable({ providedIn: 'root' })
export class ApiTokenApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  list(): Observable<ApiToken[]> {
    return this.http
      .get<JsendEnvelope<ApiTokenGoData[]>>(`${this.baseUrl}/api/v1/api-tokens`, {
        withCredentials: true,
      })
      .pipe(map((res) => res.data.map((t) => this.map(t))));
  }

  getById(id: string): Observable<ApiToken> {
    return this.http
      .get<JsendEnvelope<ApiTokenGoData>>(`${this.baseUrl}/api/v1/api-tokens/${id}`, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  create(req: CreateApiTokenRequest): Observable<CreateApiTokenResult> {
    return this.http
      .post<JsendEnvelope<CreateApiTokenGoResult>>(`${this.baseUrl}/api/v1/api-tokens`, req, {
        withCredentials: true,
      })
      .pipe(
        map((res) => ({
          ...this.map(res.data),
          rawToken: res.data.raw_token,
        }))
      );
  }

  update(id: string, req: UpdateApiTokenRequest): Observable<ApiToken> {
    return this.http
      .put<JsendEnvelope<ApiTokenGoData>>(`${this.baseUrl}/api/v1/api-tokens/${id}`, req, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(
        `${this.baseUrl}/api/v1/api-tokens/${id}`,
        { withCredentials: true }
      )
      .pipe(map(() => undefined));
  }

  private map(raw: ApiTokenGoData): ApiToken {
    return {
      id: raw.id,
      name: raw.name,
      isActive: raw.is_active,
      createdAtUtc: raw.created_at_utc,
    };
  }
}
