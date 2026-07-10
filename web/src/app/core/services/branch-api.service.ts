import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import { Branch, BranchSchedule, CreateBranchRequest } from '../models/branch.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface ScheduleGoData {
  id: string;
  branch_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  created_at_utc: string;
  updated_at_utc: string;
}

interface BranchGoData {
  id: string;
  code: string;
  store_name: string;
  tax_id: string;
  address: string;
  contact_phone: string;
  secondary_contact_phone: string | null;
  schedules: ScheduleGoData[];
  created_at_utc: string;
  updated_at_utc: string;
}

@Injectable({ providedIn: 'root' })
export class BranchApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  list(): Observable<Branch[]> {
    return this.http
      .get<JsendEnvelope<BranchGoData[]>>(`${this.baseUrl}/api/v1/branches/`)
      .pipe(map((res) => res.data.map((b) => this.mapBranch(b))));
  }

  listAdmin(): Observable<Branch[]> {
    return this.http
      .get<JsendEnvelope<BranchGoData[]>>(`${this.baseUrl}/api/v1/branches/admin`, {
        withCredentials: true,
      })
      .pipe(map((res) => res.data.map((b) => this.mapBranch(b))));
  }

  create(req: CreateBranchRequest): Observable<Branch> {
    return this.http
      .post<JsendEnvelope<BranchGoData>>(`${this.baseUrl}/api/v1/branches/`, req, {
        withCredentials: true,
      })
      .pipe(map((res) => this.mapBranch(res.data)));
  }

  private mapBranch(raw: BranchGoData): Branch {
    return {
      id: raw.id,
      code: raw.code,
      storeName: raw.store_name,
      taxId: raw.tax_id,
      address: raw.address,
      contactPhone: raw.contact_phone,
      secondaryContactPhone: raw.secondary_contact_phone,
      schedules: (raw.schedules ?? []).map((s) => this.mapSchedule(s)),
      createdAtUtc: raw.created_at_utc,
      updatedAtUtc: raw.updated_at_utc,
    };
  }

  private mapSchedule(raw: ScheduleGoData): BranchSchedule {
    return {
      id: raw.id,
      branchId: raw.branch_id,
      dayOfWeek: raw.day_of_week,
      startTime: raw.start_time,
      endTime: raw.end_time,
      createdAtUtc: raw.created_at_utc,
      updatedAtUtc: raw.updated_at_utc,
    };
  }
}
