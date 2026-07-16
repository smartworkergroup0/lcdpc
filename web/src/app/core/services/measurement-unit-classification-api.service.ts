import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import { CreateMeasurementUnitClassificationRequest, MeasurementUnitClassification } from '../models/measurement-unit-classification.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface MeasurementUnitClassificationGoData {
  id: string;
  name: string;
  code: string;
}

@Injectable({ providedIn: 'root' })
export class MeasurementUnitClassificationApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  list(): Observable<MeasurementUnitClassification[]> {
    return this.http
      .get<JsendEnvelope<MeasurementUnitClassificationGoData[]>>(`${this.baseUrl}/api/v1/measurement-unit-classifications/`)
      .pipe(map((res) => res.data.map((c) => this.map(c))));
  }

  getById(id: string): Observable<MeasurementUnitClassification> {
    return this.http
      .get<JsendEnvelope<MeasurementUnitClassificationGoData>>(`${this.baseUrl}/api/v1/measurement-unit-classifications/${id}`)
      .pipe(map((res) => this.map(res.data)));
  }

  create(req: CreateMeasurementUnitClassificationRequest): Observable<MeasurementUnitClassification> {
    return this.http
      .post<JsendEnvelope<MeasurementUnitClassificationGoData>>(`${this.baseUrl}/api/v1/measurement-unit-classifications/`, req, {
      })
      .pipe(map((res) => this.map(res.data)));
  }

  update(id: string, req: CreateMeasurementUnitClassificationRequest): Observable<MeasurementUnitClassification> {
    return this.http
      .put<JsendEnvelope<MeasurementUnitClassificationGoData>>(`${this.baseUrl}/api/v1/measurement-unit-classifications/${id}`, req, {
      })
      .pipe(map((res) => this.map(res.data)));
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(`${this.baseUrl}/api/v1/measurement-unit-classifications/${id}`, {
      })
      .pipe(map(() => undefined));
  }

  private map(raw: MeasurementUnitClassificationGoData): MeasurementUnitClassification {
    return {
      id: raw.id,
      name: raw.name,
      code: raw.code,
    };
  }
}
