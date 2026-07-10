import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import { CreatePriceRequest, ProductBranchPrice } from '../models/price.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface PriceGoData {
  id: string;
  product_id: string;
  price_category_id: string | null;
  amount: number;
  currency: string;
}

@Injectable({ providedIn: 'root' })
export class PriceApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  getById(id: string): Observable<ProductBranchPrice> {
    return this.http
      .get<JsendEnvelope<PriceGoData>>(`${this.baseUrl}/api/v1/prices/${id}`)
      .pipe(map((res) => this.map(res.data)));
  }

  listByProductId(productId: string): Observable<ProductBranchPrice[]> {
    return this.http
      .get<JsendEnvelope<PriceGoData[]>>(
        `${this.baseUrl}/api/v1/prices/product/${productId}`
      )
      .pipe(map((res) => res.data.map((p) => this.map(p))));
  }

  create(req: CreatePriceRequest): Observable<ProductBranchPrice> {
    return this.http
      .post<JsendEnvelope<PriceGoData>>(`${this.baseUrl}/api/v1/prices/`, req, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  update(id: string, req: CreatePriceRequest): Observable<ProductBranchPrice> {
    return this.http
      .put<JsendEnvelope<PriceGoData>>(`${this.baseUrl}/api/v1/prices/${id}`, req, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(`${this.baseUrl}/api/v1/prices/${id}`, {
        withCredentials: true,
      })
      .pipe(map(() => undefined));
  }

  private map(raw: PriceGoData): ProductBranchPrice {
    return {
      id: raw.id,
      productId: raw.product_id,
      priceCategoryId: raw.price_category_id,
      amount: raw.amount,
      currency: raw.currency,
    };
  }
}
