import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import { CreatePriceCategoryRequest, PriceCategory } from '../models/price-category.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface PriceCategoryGoData {
  id: string;
  name: string;
  code: string;
}

@Injectable({ providedIn: 'root' })
export class PriceCategoryApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  list(): Observable<PriceCategory[]> {
    return this.http
      .get<JsendEnvelope<PriceCategoryGoData[]>>(`${this.baseUrl}/api/v1/price-categories/`)
      .pipe(map((res) => res.data.map((c) => this.map(c))));
  }

  getById(id: string): Observable<PriceCategory> {
    return this.http
      .get<JsendEnvelope<PriceCategoryGoData>>(`${this.baseUrl}/api/v1/price-categories/${id}`)
      .pipe(map((res) => this.map(res.data)));
  }

  create(req: CreatePriceCategoryRequest): Observable<PriceCategory> {
    return this.http
      .post<JsendEnvelope<PriceCategoryGoData>>(`${this.baseUrl}/api/v1/price-categories/`, req, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  update(id: string, req: CreatePriceCategoryRequest): Observable<PriceCategory> {
    return this.http
      .put<JsendEnvelope<PriceCategoryGoData>>(`${this.baseUrl}/api/v1/price-categories/${id}`, req, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(`${this.baseUrl}/api/v1/price-categories/${id}`, {
        withCredentials: true,
      })
      .pipe(map(() => undefined));
  }

  private map(raw: PriceCategoryGoData): PriceCategory {
    return {
      id: raw.id,
      name: raw.name,
      code: raw.code,
    };
  }
}
