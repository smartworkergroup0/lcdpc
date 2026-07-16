import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import { Bundle, BundlePrice, CreateBundleRequest } from '../models/bundle.model';
import { BundleListFilter, PaginatedResponse } from '../models/pagination.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface BundleGoData {
  bundle_id: string;
  code: string;
  name: string;
  status: string;
  branch_id: string | null;
  stock: number;
  stock_available: number;
  stock_blocked: number;
  blocks_product_stock: boolean;
  items: BundleItemGoData[] | null;
  prices: BundlePriceGoData[];
  img: string | null;
  category_id: string | null;
}

interface BundleItemGoData {
  id: string;
  bundle_id: string;
  product_id: string;
  quantity: number;
}

interface BundlePriceGoData {
  id: string;
  bundle_id: string;
  price_category_id: string | null;
  amount: number;
}

interface PaginatedGoData<T> {
  items: T[];
  total_count: number;
  limit: number;
  offset: number;
}

@Injectable({ providedIn: 'root' })
export class BundleApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  list(filter?: BundleListFilter): Observable<PaginatedResponse<Bundle>> {
    const params: Record<string, string> = {};
    if (filter?.limit != null) params['limit'] = String(filter.limit);
    if (filter?.offset != null) params['offset'] = String(filter.offset);
    if (filter?.category_id) params['category_id'] = filter.category_id;
    if (filter?.name) params['name'] = filter.name;
    if (filter?.code) params['code'] = filter.code;
    if (filter?.status) params['status'] = filter.status;
    if (filter?.branch_id) params['branch_id'] = filter.branch_id;

    return this.http
      .get<JsendEnvelope<PaginatedGoData<BundleGoData>>>(`${this.baseUrl}/api/v1/bundles/`, { params })
      .pipe(
        map((res) => ({
          items: res.data.items.map((b) => this.map(b)),
          totalCount: res.data.total_count,
          limit: res.data.limit,
          offset: res.data.offset,
        }))
      );
  }

  getById(id: string): Observable<Bundle> {
    return this.http
      .get<JsendEnvelope<BundleGoData>>(`${this.baseUrl}/api/v1/bundles/${id}`)
      .pipe(map((res) => this.map(res.data)));
  }

  create(req: CreateBundleRequest, file?: File): Observable<Bundle> {
    const formData = new FormData();
    formData.append('data', JSON.stringify(req));
    if (file) {
      formData.append('file', file);
    }
    return this.http
      .post<JsendEnvelope<BundleGoData>>(`${this.baseUrl}/api/v1/bundles/`, formData)
      .pipe(map((res) => this.map(res.data)));
  }

  update(id: string, req: CreateBundleRequest, file?: File): Observable<Bundle> {
    const formData = new FormData();
    formData.append('data', JSON.stringify(req));
    if (file) {
      formData.append('file', file);
    }
    return this.http
      .put<JsendEnvelope<BundleGoData>>(`${this.baseUrl}/api/v1/bundles/${id}`, formData)
      .pipe(map((res) => this.map(res.data)));
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(`${this.baseUrl}/api/v1/bundles/${id}`)
      .pipe(map(() => undefined));
  }

  toggleActive(id: string): Observable<Bundle> {
    return this.http
      .patch<JsendEnvelope<BundleGoData>>(
        `${this.baseUrl}/api/v1/bundles/${id}/toggle-active`,
        {},
      )
      .pipe(map((res) => this.map(res.data)));
  }

  updateImage(id: string, file: File): Observable<{ img: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http
      .put<JsendEnvelope<{ img: string }>>(
        `${this.baseUrl}/api/v1/bundles/${id}/image`,
        formData,
      )
      .pipe(map((res) => res.data));
  }

  resolveImageUrl(img: string | null): string | null {
    if (!img) return null;
    if (img.startsWith('http://') || img.startsWith('https://')) return img;
    return `${this.baseUrl}${img}`;
  }

  // Bundle Prices
  listPrices(bundleId: string): Observable<BundlePrice[]> {
    return this.http
      .get<JsendEnvelope<BundlePriceGoData[]>>(`${this.baseUrl}/api/v1/bundles/${bundleId}/prices`)
      .pipe(map((res) => res.data.map((p) => this.mapPrice(p))));
  }

  createPrice(bundleId: string, priceCategoryId: string | null, amount: number): Observable<BundlePrice> {
    return this.http
      .post<JsendEnvelope<BundlePriceGoData>>(
        `${this.baseUrl}/api/v1/bundles/${bundleId}/prices`,
        { price_category_id: priceCategoryId, amount },
      )
      .pipe(map((res) => this.mapPrice(res.data)));
  }

  updatePrice(bundleId: string, priceId: string, priceCategoryId: string | null, amount: number): Observable<BundlePrice> {
    return this.http
      .put<JsendEnvelope<BundlePriceGoData>>(
        `${this.baseUrl}/api/v1/bundles/${bundleId}/prices/${priceId}`,
        { price_category_id: priceCategoryId, amount },
      )
      .pipe(map((res) => this.mapPrice(res.data)));
  }

  deletePrice(bundleId: string, priceId: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(
        `${this.baseUrl}/api/v1/bundles/${bundleId}/prices/${priceId}`,
      )
      .pipe(map(() => undefined));
  }

  private mapPrice(raw: BundlePriceGoData): BundlePrice {
    return {
      id: raw.id,
      bundleId: raw.bundle_id,
      priceCategoryId: raw.price_category_id,
      amount: raw.amount,
    };
  }

  private map(raw: BundleGoData): Bundle {
    return {
      bundleId: raw.bundle_id,
      code: raw.code,
      name: raw.name,
      status: raw.status,
      branchId: raw.branch_id,
      stock: raw.stock,
      stockAvailable: raw.stock_available,
      stockBlocked: raw.stock_blocked,
      blocksProductStock: raw.blocks_product_stock,
      items: raw.items
        ? raw.items.map((i) => ({
            id: i.id,
            bundleId: i.bundle_id,
            productId: i.product_id,
            quantity: i.quantity,
          }))
        : null,
      prices: raw.prices ? raw.prices.map((p) => this.mapPrice(p)) : [],
      img: raw.img,
      categoryId: raw.category_id,
    };
  }
}
