import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import {
  ServiceAccount,
  CreateServiceAccountRequest,
  CreateServiceAccountResult,
  UpdateServiceAccountRequest,
} from '../models/service-account.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface ServiceAccountGoData {
  id: string;
  name: string;
  username: string;
  profile_id: string;
  profile_name: string;
  token_expiry_hours: number;
  is_active: boolean;
  created_at_utc: string;
  updated_at_utc: string;
}

interface CreateServiceAccountGoResult extends ServiceAccountGoData {
  raw_password: string;
}

@Injectable({ providedIn: 'root' })
export class ServiceAccountApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  list(): Observable<ServiceAccount[]> {
    return this.http
      .get<JsendEnvelope<ServiceAccountGoData[]>>(`${this.baseUrl}/api/v1/service-accounts`, {
        withCredentials: true,
      })
      .pipe(map((res) => res.data.map((t) => this.map(t))));
  }

  getById(id: string): Observable<ServiceAccount> {
    return this.http
      .get<JsendEnvelope<ServiceAccountGoData>>(`${this.baseUrl}/api/v1/service-accounts/${id}`, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  create(req: CreateServiceAccountRequest): Observable<CreateServiceAccountResult> {
    return this.http
      .post<JsendEnvelope<CreateServiceAccountGoResult>>(`${this.baseUrl}/api/v1/service-accounts`, req, {
        withCredentials: true,
      })
      .pipe(
        map((res) => ({
          ...this.map(res.data),
          rawPassword: res.data.raw_password,
        }))
      );
  }

  update(id: string, req: UpdateServiceAccountRequest): Observable<ServiceAccount> {
    return this.http
      .put<JsendEnvelope<ServiceAccountGoData>>(`${this.baseUrl}/api/v1/service-accounts/${id}`, req, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(
        `${this.baseUrl}/api/v1/service-accounts/${id}`,
        { withCredentials: true }
      )
      .pipe(map(() => undefined));
  }

  private map(raw: ServiceAccountGoData): ServiceAccount {
    return {
      id: raw.id,
      name: raw.name,
      username: raw.username,
      profileId: raw.profile_id,
      profileName: raw.profile_name,
      tokenExpiryHours: raw.token_expiry_hours,
      isActive: raw.is_active,
      createdAtUtc: raw.created_at_utc,
      updatedAtUtc: raw.updated_at_utc,
    };
  }
}
