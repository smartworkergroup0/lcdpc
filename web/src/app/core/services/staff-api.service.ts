import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import { PaginatedResponse } from '../models/pagination.model';
import {
  CreateStaffRequest,
  ProfileOption,
  StaffListFilter,
  StaffLookupResult,
  StaffMember,
  UpdateStaffRequest,
} from '../models/staff.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface StaffGoData {
  user_id: string;
  person_name: string;
  email: string;
  status: string;
  branch_id: string | null;
  branch_name: string | null;
  identity_document: string;
  whatsapp_phone: string;
  profile_id: string;
  profile_name: string;
  profile_weight: number;
  created_at_utc: string;
}

interface PaginatedGoData<T> {
  items: T[];
  total_count: number;
  limit: number;
  offset: number;
}

@Injectable({ providedIn: 'root' })
export class StaffApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  lookupByDocument(doc: string): Observable<StaffLookupResult> {
    return this.http
      .get<JsendEnvelope<StaffLookupResult>>(`${this.baseUrl}/api/v1/staff/lookup-by-document/${encodeURIComponent(doc)}`)
      .pipe(map((res) => res.data));
  }

  list(filter?: StaffListFilter): Observable<PaginatedResponse<StaffMember>> {
    const params: Record<string, string> = {};
    if (filter?.limit != null) params['limit'] = String(filter.limit);
    if (filter?.offset != null) params['offset'] = String(filter.offset);
    if (filter?.branch_id) params['branch_id'] = filter.branch_id;
    if (filter?.role_code) params['role_code'] = filter.role_code;
    if (filter?.search) params['search'] = filter.search;

    return this.http
      .get<JsendEnvelope<PaginatedGoData<StaffGoData>>>(`${this.baseUrl}/api/v1/staff/`, { params })
      .pipe(
        map((res) => ({
          items: res.data.items.map((s) => this.map(s)),
          totalCount: res.data.total_count,
          limit: res.data.limit,
          offset: res.data.offset,
        }))
      );
  }

  getById(id: string): Observable<StaffMember> {
    return this.http
      .get<JsendEnvelope<StaffGoData>>(`${this.baseUrl}/api/v1/staff/${id}`)
      .pipe(map((res) => this.map(res.data)));
  }

  create(req: CreateStaffRequest): Observable<StaffMember> {
    return this.http
      .post<JsendEnvelope<StaffGoData>>(`${this.baseUrl}/api/v1/staff/`, req, {
      })
      .pipe(map((res) => this.map(res.data)));
  }

  update(id: string, req: UpdateStaffRequest): Observable<StaffMember> {
    return this.http
      .put<JsendEnvelope<StaffGoData>>(`${this.baseUrl}/api/v1/staff/${id}`, req, {
      })
      .pipe(map((res) => this.map(res.data)));
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(`${this.baseUrl}/api/v1/staff/${id}`, {
      })
      .pipe(map(() => undefined));
  }

  toggleStatus(id: string): Observable<StaffMember> {
    return this.http
      .patch<JsendEnvelope<StaffGoData>>(`${this.baseUrl}/api/v1/staff/${id}/toggle-status`, {})
      .pipe(map((res) => this.map(res.data)));
  }

  listProfiles(): Observable<ProfileOption[]> {
    return this.http
      .get<JsendEnvelope<ProfileOption[]>>(`${this.baseUrl}/api/v1/staff/profiles`)
      .pipe(map((res) => res.data));
  }

  private map(raw: StaffGoData): StaffMember {
    return {
      userId: raw.user_id,
      personName: raw.person_name,
      email: raw.email,
      status: raw.status,
      branchId: raw.branch_id,
      branchName: raw.branch_name,
      identityDocument: raw.identity_document,
      whatsappPhone: raw.whatsapp_phone,
      profileId: raw.profile_id,
      profileName: raw.profile_name,
      profileWeight: raw.profile_weight ?? 0,
      createdAtUtc: raw.created_at_utc,
    };
  }
}
