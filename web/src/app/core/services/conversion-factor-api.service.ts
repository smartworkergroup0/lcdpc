import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import { ConversionFactor, CreateConversionFactorRequest } from '../models/conversion-factor.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface ConversionFactorGoData {
  id: string;
  product_id: string;
  from_unit_id: string;
  to_unit_id: string;
  amount: number;
  main: boolean;
}

@Injectable({ providedIn: 'root' })
export class ConversionFactorApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  getById(id: string): Observable<ConversionFactor> {
    return this.http
      .get<JsendEnvelope<ConversionFactorGoData>>(`${this.baseUrl}/api/v1/conversion-factors/${id}`)
      .pipe(map((res) => this.map(res.data)));
  }

  listByProductId(productId: string): Observable<ConversionFactor[]> {
    return this.http
      .get<JsendEnvelope<ConversionFactorGoData[]>>(
        `${this.baseUrl}/api/v1/conversion-factors/product/${productId}`
      )
      .pipe(map((res) => res.data.map((cf) => this.map(cf))));
  }

  create(req: CreateConversionFactorRequest): Observable<ConversionFactor> {
    return this.http
      .post<JsendEnvelope<ConversionFactorGoData>>(`${this.baseUrl}/api/v1/conversion-factors/`, req, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  update(id: string, req: CreateConversionFactorRequest): Observable<ConversionFactor> {
    return this.http
      .put<JsendEnvelope<ConversionFactorGoData>>(`${this.baseUrl}/api/v1/conversion-factors/${id}`, req, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(`${this.baseUrl}/api/v1/conversion-factors/${id}`, {
        withCredentials: true,
      })
      .pipe(map(() => undefined));
  }

  private map(raw: ConversionFactorGoData): ConversionFactor {
    return {
      id: raw.id,
      productId: raw.product_id,
      fromUnitId: raw.from_unit_id,
      toUnitId: raw.to_unit_id,
      amount: raw.amount,
      main: raw.main,
    };
  }
}
