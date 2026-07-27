import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import {
  AssistantSession,
  CreateAssistantSessionRequest,
  UpdateAssistantSessionRequest,
} from '../models/assistant-session.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface AssistantSessionGoData {
  id: string;
  username: string;
  branch_id: string;
  branch_name: string;
  is_active: boolean;
  created_at_utc: string;
  updated_at_utc: string;
}

@Injectable({ providedIn: 'root' })
export class AssistantSessionApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string,
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  list(): Observable<AssistantSession[]> {
    return this.http
      .get<JsendEnvelope<AssistantSessionGoData[]>>(`${this.baseUrl}/api/v1/external/assistant/sessions`)
      .pipe(map((res) => res.data.map((t) => this.map(t))));
  }

  create(req: CreateAssistantSessionRequest): Observable<AssistantSession> {
    return this.http
      .post<JsendEnvelope<AssistantSessionGoData>>(`${this.baseUrl}/api/v1/external/assistant/sessions`, req)
      .pipe(map((res) => this.map(res.data)));
  }

  update(id: string, req: UpdateAssistantSessionRequest): Observable<AssistantSession> {
    return this.http
      .put<JsendEnvelope<AssistantSessionGoData>>(`${this.baseUrl}/api/v1/external/assistant/sessions/${id}`, req)
      .pipe(map((res) => this.map(res.data)));
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(`${this.baseUrl}/api/v1/external/assistant/sessions/${id}`)
      .pipe(map(() => undefined));
  }

  private map(raw: AssistantSessionGoData): AssistantSession {
    return {
      id: raw.id,
      username: raw.username,
      branchId: raw.branch_id,
      branchName: raw.branch_name,
      isActive: raw.is_active,
      createdAtUtc: raw.created_at_utc,
      updatedAtUtc: raw.updated_at_utc,
    };
  }
}
