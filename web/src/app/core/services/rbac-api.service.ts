import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import {
  AssignResourceRequest,
  AssignRoleRequest,
  CreateProfileRequest,
  CreateResourceRequest,
  CreateRoleRequest,
  Profile,
  Resource,
  ResourceEntry,
  Role,
  RoleEntry,
  UpdateProfileRequest,
  UpdateResourceRequest,
  UpdateRoleRequest,
} from '../models/rbac.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface ResourceGoData {
  id: string;
  code: string;
}

interface RoleGoData {
  id: string;
  code: string;
  name: string;
  description: string;
  resources: ResourceEntry[];
}

interface ProfileGoData {
  id: string;
  name: string;
  code: string;
  roles: RoleEntry[];
  user_count: number;
  created_at_utc: string;
  updated_at_utc: string;
}

@Injectable({ providedIn: 'root' })
export class RbacApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  // ── Resources ──────────────────────────────────────────

  listResources(): Observable<Resource[]> {
    return this.http
      .get<JsendEnvelope<ResourceGoData[]>>(`${this.baseUrl}/api/v1/rbac/resources`)
      .pipe(map((res) => res.data.map((r) => ({ id: r.id, code: r.code }))));
  }

  getResource(id: string): Observable<Resource> {
    return this.http
      .get<JsendEnvelope<ResourceGoData>>(`${this.baseUrl}/api/v1/rbac/resources/${id}`)
      .pipe(map((res) => ({ id: res.data.id, code: res.data.code })));
  }

  createResource(req: CreateResourceRequest): Observable<Resource> {
    return this.http
      .post<JsendEnvelope<ResourceGoData>>(`${this.baseUrl}/api/v1/rbac/resources`, req)
      .pipe(map((res) => ({ id: res.data.id, code: res.data.code })));
  }

  updateResource(id: string, req: UpdateResourceRequest): Observable<Resource> {
    return this.http
      .put<JsendEnvelope<ResourceGoData>>(`${this.baseUrl}/api/v1/rbac/resources/${id}`, req)
      .pipe(map((res) => ({ id: res.data.id, code: res.data.code })));
  }

  deleteResource(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(
        `${this.baseUrl}/api/v1/rbac/resources/${id}`,
      )
      .pipe(map(() => undefined));
  }

  // ── Roles ──────────────────────────────────────────────

  listRoles(): Observable<Role[]> {
    return this.http
      .get<JsendEnvelope<RoleGoData[]>>(`${this.baseUrl}/api/v1/rbac/roles`)
      .pipe(map((res) => res.data.map((r) => this.mapRole(r))));
  }

  getRole(id: string): Observable<Role> {
    return this.http
      .get<JsendEnvelope<RoleGoData>>(`${this.baseUrl}/api/v1/rbac/roles/${id}`)
      .pipe(map((res) => this.mapRole(res.data)));
  }

  createRole(req: CreateRoleRequest): Observable<Role> {
    return this.http
      .post<JsendEnvelope<RoleGoData>>(`${this.baseUrl}/api/v1/rbac/roles`, req)
      .pipe(map((res) => this.mapRole(res.data)));
  }

  updateRole(id: string, req: UpdateRoleRequest): Observable<Role> {
    return this.http
      .put<JsendEnvelope<RoleGoData>>(`${this.baseUrl}/api/v1/rbac/roles/${id}`, req)
      .pipe(map((res) => this.mapRole(res.data)));
  }

  deleteRole(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(
        `${this.baseUrl}/api/v1/rbac/roles/${id}`,
      )
      .pipe(map(() => undefined));
  }

  assignResourceToRole(roleId: string, req: AssignResourceRequest): Observable<void> {
    return this.http
      .post<JsendEnvelope<{ status: string }>>(
        `${this.baseUrl}/api/v1/rbac/roles/${roleId}/resources`,
        req,
      )
      .pipe(map(() => undefined));
  }

  removeResourceFromRole(roleId: string, resourceId: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(
        `${this.baseUrl}/api/v1/rbac/roles/${roleId}/resources/${resourceId}`,
      )
      .pipe(map(() => undefined));
  }

  // ── Profiles ───────────────────────────────────────────

  listProfiles(): Observable<Profile[]> {
    return this.http
      .get<JsendEnvelope<ProfileGoData[]>>(`${this.baseUrl}/api/v1/rbac/profiles`)
      .pipe(map((res) => res.data.map((p) => this.mapProfile(p))));
  }

  getProfile(id: string): Observable<Profile> {
    return this.http
      .get<JsendEnvelope<ProfileGoData>>(`${this.baseUrl}/api/v1/rbac/profiles/${id}`)
      .pipe(map((res) => this.mapProfile(res.data)));
  }

  createProfile(req: CreateProfileRequest): Observable<Profile> {
    return this.http
      .post<JsendEnvelope<ProfileGoData>>(`${this.baseUrl}/api/v1/rbac/profiles`, req)
      .pipe(map((res) => this.mapProfile(res.data)));
  }

  updateProfile(id: string, req: UpdateProfileRequest): Observable<Profile> {
    return this.http
      .put<JsendEnvelope<ProfileGoData>>(`${this.baseUrl}/api/v1/rbac/profiles/${id}`, req)
      .pipe(map((res) => this.mapProfile(res.data)));
  }

  deleteProfile(id: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(
        `${this.baseUrl}/api/v1/rbac/profiles/${id}`,
      )
      .pipe(map(() => undefined));
  }

  assignRoleToProfile(profileId: string, req: AssignRoleRequest): Observable<void> {
    return this.http
      .post<JsendEnvelope<{ status: string }>>(
        `${this.baseUrl}/api/v1/rbac/profiles/${profileId}/roles`,
        req,
      )
      .pipe(map(() => undefined));
  }

  removeRoleFromProfile(profileId: string, roleId: string): Observable<void> {
    return this.http
      .delete<JsendEnvelope<{ status: string }>>(
        `${this.baseUrl}/api/v1/rbac/profiles/${profileId}/roles/${roleId}`,
      )
      .pipe(map(() => undefined));
  }

  // ── Users ──────────────────────────────────────────────

  assignProfileToUser(userId: string, req: { profile_id: string }): Observable<void> {
    return this.http
      .post<JsendEnvelope<{ status: string }>>(
        `${this.baseUrl}/api/v1/users/${userId}/profile`,
        req,
      )
      .pipe(map(() => undefined));
  }

  // ── Mappers ────────────────────────────────────────────

  private mapRole(raw: RoleGoData): Role {
    return {
      id: raw.id,
      code: raw.code,
      name: raw.name,
      description: raw.description,
      resources: raw.resources,
    };
  }

  private mapProfile(raw: ProfileGoData): Profile {
    return {
      id: raw.id,
      name: raw.name,
      code: raw.code,
      roles: raw.roles,
      userCount: raw.user_count,
      createdAtUtc: raw.created_at_utc,
      updatedAtUtc: raw.updated_at_utc,
    };
  }
}
