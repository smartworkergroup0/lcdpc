import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import { SystemConfig, CreateSystemConfigRequest, UpdateSystemConfigRequest } from '../models/system-config.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface SystemConfigGoData {
  id: string;
  logo_path: string | null;
  icon_path: string | null;
  page_name: string;
  title: string;
  show_price_in_catalog: boolean;
  negative_stock: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class SystemConfigApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  list(): Observable<SystemConfig[]> {
    return this.http
      .get<JsendEnvelope<SystemConfigGoData[]>>(`${this.baseUrl}/api/v1/system-config/`, {
        withCredentials: true,
      })
      .pipe(map((res) => res.data.map((d) => this.map(d))));
  }

  getActive(): Observable<SystemConfig> {
    return this.http
      .get<JsendEnvelope<SystemConfigGoData>>(`${this.baseUrl}/api/v1/system-config/active`, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  create(req: CreateSystemConfigRequest, logoFile?: File, iconFile?: File): Observable<SystemConfig> {
    const formData = new FormData();
    formData.append('data', JSON.stringify(req));
    if (logoFile) {
      formData.append('logo', logoFile);
    }
    if (iconFile) {
      formData.append('icon', iconFile);
    }
    return this.http
      .post<JsendEnvelope<SystemConfigGoData>>(`${this.baseUrl}/api/v1/system-config/`, formData, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  update(id: string, req: UpdateSystemConfigRequest, logoFile?: File, iconFile?: File): Observable<SystemConfig> {
    const formData = new FormData();
    formData.append('data', JSON.stringify(req));
    if (logoFile) {
      formData.append('logo', logoFile);
    }
    if (iconFile) {
      formData.append('icon', iconFile);
    }
    return this.http
      .put<JsendEnvelope<SystemConfigGoData>>(`${this.baseUrl}/api/v1/system-config/${id}`, formData, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  getLogo(): Observable<string | null> {
    return this.http
      .get<JsendEnvelope<{ logo_path: string | null }>>(`${this.baseUrl}/api/v1/system/logo`)
      .pipe(map((res) => res.data.logo_path));
  }

  getIcon(): Observable<string | null> {
    return this.http
      .get<JsendEnvelope<{ icon_path: string | null }>>(`${this.baseUrl}/api/v1/system/icon`)
      .pipe(map((res) => res.data.icon_path));
  }

  getPageName(): Observable<string> {
    return this.http
      .get<JsendEnvelope<{ page_name: string }>>(`${this.baseUrl}/api/v1/system/page-name`)
      .pipe(map((res) => res.data.page_name));
  }

  getTitle(): Observable<string> {
    return this.http
      .get<JsendEnvelope<{ title: string }>>(`${this.baseUrl}/api/v1/system/title`)
      .pipe(map((res) => res.data.title));
  }

  getShowPrice(): Observable<boolean> {
    return this.http
      .get<JsendEnvelope<{ show_price_in_catalog: boolean }>>(`${this.baseUrl}/api/v1/system/show-price`)
      .pipe(map((res) => res.data.show_price_in_catalog));
  }

  getNegativeStock(): Observable<boolean> {
    return this.http
      .get<JsendEnvelope<{ negative_stock: boolean }>>(`${this.baseUrl}/api/v1/system/negative-stock`)
      .pipe(map((res) => res.data.negative_stock));
  }

  resolveImageUrl(img: string | null): string | null {
    if (!img) return null;
    if (img.startsWith('http://') || img.startsWith('https://')) return img;
    return `${this.baseUrl}${img}`;
  }

  private map(raw: SystemConfigGoData): SystemConfig {
    return {
      id: raw.id,
      logoPath: raw.logo_path,
      iconPath: raw.icon_path,
      pageName: raw.page_name,
      title: raw.title,
      showPriceInCatalog: raw.show_price_in_catalog,
      negativeStock: raw.negative_stock,
      active: raw.active,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
    };
  }
}
