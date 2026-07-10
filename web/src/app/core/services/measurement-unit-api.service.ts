import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import { CreateMeasurementUnitRequest, MeasurementUnit } from '../models/measurement-unit.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface MeasurementUnitGoData {
  id: string;
  name: string;
  code: string;
  symbol: string | null;
  classification_id: string | null;
}

@Injectable({ providedIn: 'root' })
export class MeasurementUnitApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  list(): Observable<MeasurementUnit[]> {
    return this.http
      .get<JsendEnvelope<MeasurementUnitGoData[]>>(`${this.baseUrl}/api/v1/measurement-units/`)
      .pipe(map((res) => res.data.map((u) => this.map(u))));
  }

  getById(id: string): Observable<MeasurementUnit> {
    return this.http
      .get<JsendEnvelope<MeasurementUnitGoData>>(`${this.baseUrl}/api/v1/measurement-units/${id}`)
      .pipe(map((res) => this.map(res.data)));
  }

  create(req: CreateMeasurementUnitRequest): Observable<MeasurementUnit> {
    return this.http
      .post<JsendEnvelope<MeasurementUnitGoData>>(`${this.baseUrl}/api/v1/measurement-units/`, req, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  update(id: string, req: CreateMeasurementUnitRequest): Observable<MeasurementUnit> {
    return this.http
      .put<JsendEnvelope<MeasurementUnitGoData>>(`${this.baseUrl}/api/v1/measurement-units/${id}`, req, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(`${this.baseUrl}/api/v1/measurement-units/${id}`, {
        withCredentials: true,
      })
      .pipe(map(() => undefined));
  }

  private map(raw: MeasurementUnitGoData): MeasurementUnit {
    return {
      id: raw.id,
      name: raw.name,
      code: raw.code,
      symbol: raw.symbol,
      classificationId: raw.classification_id,
    };
  }
}
