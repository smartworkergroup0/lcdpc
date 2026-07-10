import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Inject, Injectable, InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');

export interface LoginRequest {
  email: string;
  password: string;
}

export interface StartRegistrationRequest {
  email: string;
}

export interface StartRegistrationResponse {
  flowId: string;
  status: string;
  otpPolicy: {
    ttlMinutes: number;
    maxAttempts: number;
    cooldownMinutes: number;
  };
}

export interface VerifyEmailRegistrationRequest {
  flowId: string;
  otp: string;
}

export interface VerifyEmailRegistrationResponse {
  flowId: string;
  status: string;
}

export interface CompleteProfileRegistrationRequest {
  flowId: string;
  nombres: string;
  apellidos: string;
  documentoIdentidad: string;
  rif: string | null;
  telefonoWhatsApp: string;
  direccionCompleta: string;
  password: string;
}

export interface CompleteProfileRegistrationResponse {
  usuarioId: string;
  estado: string;
  tipoCuenta: string;
}

export interface TokenPairResponse {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface UserSummaryResponse {
  usuarioId: string;
  email: string;
  displayName: string;
  estado: string;
  tipoCuenta: string;
  onboardingStatus: string;
  emailVerifiedAtUtc: string | null;
  roles: string[];
}

export interface ResourcePermissionResponse {
  resourceCode: string;
  canView: boolean;
  canWrite: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canAll: boolean;
}

export interface LoginResponse {
  tokenPair: TokenPairResponse;
  userSummary: UserSummaryResponse;
  permissions: ResourcePermissionResponse[];
}

export interface MeResponse {
  authenticated: boolean;
  userSummary: UserSummaryResponse | null;
  permissions: ResourcePermissionResponse[];
  expiresInSeconds: number | null;
  scopes: string[] | null;
}

export interface RefreshSessionResponse {
  tokenPair: TokenPairResponse;
  userSummary: UserSummaryResponse;
  permissions: ResourcePermissionResponse[];
}

@Injectable({
  providedIn: 'root'
})
export class AuthApiService {
  private readonly normalizedApiBaseUrl: string;

  constructor(
    private readonly httpClient: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.normalizedApiBaseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  login(request: LoginRequest): Observable<LoginResponse> {
    return this.httpClient.post<LoginResponse>(this.url('/api/v1/auth/login'), request, {
      withCredentials: true
    });
  }

  me(accessToken?: string): Observable<MeResponse> {
    const headers = accessToken
      ? new HttpHeaders({ Authorization: `Bearer ${accessToken}` })
      : undefined;

    return this.httpClient.get<MeResponse>(this.url('/api/v1/auth/me'), {
      headers,
      withCredentials: true
    });
  }

  refresh(): Observable<RefreshSessionResponse> {
    return this.httpClient.post<RefreshSessionResponse>(this.url('/api/v1/auth/refresh'), {}, {
      withCredentials: true
    });
  }

  logout(): Observable<void> {
    return this.httpClient.post<void>(this.url('/api/v1/auth/logout'), {}, {
      withCredentials: true
    });
  }

  startRegistration(request: StartRegistrationRequest): Observable<StartRegistrationResponse> {
    return this.httpClient.post<StartRegistrationResponse>(this.url('/api/v1/auth/register/start'), request, {
      withCredentials: true
    });
  }

  verifyEmail(request: VerifyEmailRegistrationRequest): Observable<VerifyEmailRegistrationResponse> {
    return this.httpClient.post<VerifyEmailRegistrationResponse>(this.url('/api/v1/auth/register/verify-email'), request, {
      withCredentials: true
    });
  }

  completeProfile(request: CompleteProfileRegistrationRequest): Observable<CompleteProfileRegistrationResponse> {
    return this.httpClient.post<CompleteProfileRegistrationResponse>(this.url('/api/v1/auth/register/profile'), request, {
      withCredentials: true
    });
  }

  private url(path: string): string {
    return `${this.normalizedApiBaseUrl}${path}`;
  }
}
