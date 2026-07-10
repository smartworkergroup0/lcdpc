import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import { Brand, CreateBrandRequest } from '../models/brand.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface BrandGoData {
  id: string;
  name: string;
  code: string;
  created_at_utc: string;
  updated_at_utc: string;
}

@Injectable({ providedIn: 'root' })
export class BrandApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  list(): Observable<Brand[]> {
    return this.http
      .get<JsendEnvelope<BrandGoData[]>>(`${this.baseUrl}/api/v1/brands/`)
      .pipe(map((res) => res.data.map((c) => this.map(c))));
  }

  getById(id: string): Observable<Brand> {
    return this.http
      .get<JsendEnvelope<BrandGoData>>(`${this.baseUrl}/api/v1/brands/${id}`, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  create(req: CreateBrandRequest): Observable<Brand> {
    return this.http
      .post<JsendEnvelope<BrandGoData>>(`${this.baseUrl}/api/v1/brands/`, req, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  update(id: string, req: CreateBrandRequest): Observable<Brand> {
    return this.http
      .put<JsendEnvelope<BrandGoData>>(`${this.baseUrl}/api/v1/brands/${id}`, req, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(`${this.baseUrl}/api/v1/brands/${id}`, {
        withCredentials: true,
      })
      .pipe(map(() => undefined));
  }

  private map(raw: BrandGoData): Brand {
    return {
      id: raw.id,
      name: raw.name,
      code: raw.code,
      createdAtUtc: raw.created_at_utc,
      updatedAtUtc: raw.updated_at_utc,
    };
  }
}
