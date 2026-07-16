import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import { CreateProductRequest, Product } from '../models/product.model';
import { PaginatedResponse, ProductListFilter } from '../models/pagination.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface ProductGoData {
  product_id: string;
  name: string;
  sku: string;
  is_active: boolean;
  img: string | null;
  brand_id: string;
  category_id: string | null;
  branch_id: string | null;
  stock: number;
  stock_available: number;
  stock_blocked: number;
  base_unit_id: string | null;
}

interface PaginatedGoData<T> {
  items: T[];
  total_count: number;
  limit: number;
  offset: number;
}

@Injectable({ providedIn: 'root' })
export class ProductApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  list(filter?: ProductListFilter): Observable<PaginatedResponse<Product>> {
    const params: Record<string, string> = {};
    if (filter?.limit != null) params['limit'] = String(filter.limit);
    if (filter?.offset != null) params['offset'] = String(filter.offset);
    if (filter?.category_id) params['category_id'] = filter.category_id;
    if (filter?.name) params['name'] = filter.name;
    if (filter?.sku) params['sku'] = filter.sku;
    if (filter?.is_active != null) params['is_active'] = String(filter.is_active);
    if (filter?.branch_id) params['branch_id'] = filter.branch_id;

    return this.http
      .get<JsendEnvelope<PaginatedGoData<ProductGoData>>>(`${this.baseUrl}/api/v1/products/`, { params })
      .pipe(
        map((res) => ({
          items: res.data.items.map((p) => this.map(p)),
          totalCount: res.data.total_count,
          limit: res.data.limit,
          offset: res.data.offset,
        }))
      );
  }

  getById(id: string): Observable<Product> {
    return this.http
      .get<JsendEnvelope<ProductGoData>>(`${this.baseUrl}/api/v1/products/${id}`)
      .pipe(map((res) => this.map(res.data)));
  }

  create(req: CreateProductRequest, file?: File): Observable<Product> {
    const formData = new FormData();
    formData.append('data', JSON.stringify(req));
    if (file) {
      formData.append('file', file);
    }
    return this.http
      .post<JsendEnvelope<ProductGoData>>(`${this.baseUrl}/api/v1/products/`, formData)
      .pipe(map((res) => this.map(res.data)));
  }

  update(id: string, req: CreateProductRequest, file?: File): Observable<Product> {
    const formData = new FormData();
    formData.append('data', JSON.stringify(req));
    if (file) {
      formData.append('file', file);
    }
    return this.http
      .put<JsendEnvelope<ProductGoData>>(`${this.baseUrl}/api/v1/products/${id}`, formData)
      .pipe(map((res) => this.map(res.data)));
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(`${this.baseUrl}/api/v1/products/${id}`)
      .pipe(map(() => undefined));
  }

  toggleActive(id: string): Observable<Product> {
    return this.http
      .patch<JsendEnvelope<ProductGoData>>(`${this.baseUrl}/api/v1/products/${id}/toggle-active`, {})
      .pipe(map((res) => this.map(res.data)));
  }

  updateImage(id: string, file: File): Observable<{ img: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http
      .put<JsendEnvelope<{ img: string }>>(
        `${this.baseUrl}/api/v1/products/${id}/image`,
        formData,
      )
      .pipe(map((res) => res.data));
  }

  resolveImageUrl(img: string | null): string | null {
    if (!img) return null;
    if (img.startsWith('http://') || img.startsWith('https://')) return img;
    return `${this.baseUrl}${img}`;
  }

  private map(raw: ProductGoData): Product {
    return {
      productId: raw.product_id,
      name: raw.name,
      sku: raw.sku,
      isActive: raw.is_active,
      img: raw.img,
      brandId: raw.brand_id,
      categoryId: raw.category_id,
      branchId: raw.branch_id,
      stock: raw.stock,
      stockAvailable: raw.stock_available,
      stockBlocked: raw.stock_blocked,
      baseUnitId: raw.base_unit_id,
    };
  }
}
