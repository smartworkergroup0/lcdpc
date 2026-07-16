import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import { Category, CreateCategoryRequest, UpdateCategoryRequest } from '../models/category.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface CategoryGoData {
  category_id: string;
  name: string;
  code: string;
  created_at_utc: string;
  updated_at_utc: string;
}

@Injectable({ providedIn: 'root' })
export class CategoryApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  list(): Observable<Category[]> {
    return this.http
      .get<JsendEnvelope<CategoryGoData[]>>(`${this.baseUrl}/api/v1/categories/`)
      .pipe(map((res) => res.data.map((c) => this.map(c))));
  }

  getById(id: string): Observable<Category> {
    return this.http
      .get<JsendEnvelope<CategoryGoData>>(`${this.baseUrl}/api/v1/categories/${id}`)
      .pipe(map((res) => this.map(res.data)));
  }

  create(req: CreateCategoryRequest): Observable<Category> {
    return this.http
      .post<JsendEnvelope<CategoryGoData>>(`${this.baseUrl}/api/v1/categories/`, req)
      .pipe(map((res) => this.map(res.data)));
  }

  update(id: string, req: UpdateCategoryRequest): Observable<Category> {
    return this.http
      .put<JsendEnvelope<CategoryGoData>>(`${this.baseUrl}/api/v1/categories/${id}`, req)
      .pipe(map((res) => this.map(res.data)));
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(`${this.baseUrl}/api/v1/categories/${id}`)
      .pipe(map(() => undefined));
  }

  private map(raw: CategoryGoData): Category {
    return {
      categoryId: raw.category_id,
      name: raw.name,
      code: raw.code,
      createdAtUtc: raw.created_at_utc,
      updatedAtUtc: raw.updated_at_utc,
    };
  }
}
