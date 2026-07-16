import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, InjectionToken } from '@angular/core';
import { Observable, map } from 'rxjs';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  status: string;
  message: string;
  otpPolicy: {
    ttlMinutes: number;
    maxAttempts: number;
    cooldownMinutes: number;
  };
}

export interface ResetPasswordRequest {
  email: string;
  otp: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  status: string;
  sessionsRevoked: boolean;
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

export interface CompleteRegistrationRequest {
  flowId: string;
  firstName: string;
  lastName: string;
  identityDocument: string;
  taxId: string | null;
  whatsappPhone: string;
  fullAddress: string;
  password: string;
}

export interface CompleteRegistrationResponse {
  userId: string;
  status: string;
  accountType: string;
}

export interface CheckDocumentAvailabilityResponse {
  available: boolean;
  code?: string;
  message?: string;
}

// Raw Go API response types (snake_case)

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface LoginGoData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface ForgotPasswordGoData {
  status: string;
  message: string;
  otp_policy: {
    ttl_minutes: number;
    max_attempts: number;
    cooldown_minutes: number;
  };
}

interface ResetPasswordGoData {
  status: string;
  sessions_revoked: boolean;
}

interface StartRegistrationGoData {
  flow_id: string;
  status: string;
  otp_policy: {
    ttl_minutes: number;
    max_attempts: number;
    cooldown_minutes: number;
  };
}

interface VerifyEmailGoData {
  flow_id: string;
  status: string;
}

interface CompleteRegistrationGoData {
  user_id: string;
  status: string;
  account_type: string;
}

// Mapped frontend types

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly normalizedApiBaseUrl: string;

  constructor(
    private readonly httpClient: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.normalizedApiBaseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  login(request: LoginRequest): Observable<LoginResult> {
    return this.httpClient
      .post<JsendEnvelope<LoginGoData>>(this.url('/api/v1/auth/login'), request, {
      })
      .pipe(
        map((res) => ({
          accessToken: res.data.access_token,
          refreshToken: res.data.refresh_token,
          expiresIn: res.data.expires_in,
        }))
      );
  }

  me(): Observable<any> {
    return this.httpClient
      .get<JsendEnvelope<any>>(this.url('/api/v1/auth/me'), {
      })
      .pipe(map((res) => res.data));
  }

  refresh(): Observable<LoginResult> {
    return this.httpClient
      .post<JsendEnvelope<LoginGoData>>(this.url('/api/v1/auth/refresh'), {}, {
      })
      .pipe(
        map((res) => ({
          accessToken: res.data.access_token,
          refreshToken: res.data.refresh_token,
          expiresIn: res.data.expires_in,
        }))
      );
  }

  logout(): Observable<void> {
    return this.httpClient.post<void>(this.url('/api/v1/auth/logout'), {}, {
    });
  }

  forgotPassword(request: ForgotPasswordRequest): Observable<ForgotPasswordResponse> {
    return this.httpClient
      .post<JsendEnvelope<ForgotPasswordGoData>>(this.url('/api/v1/auth/forgot-password'), request)
      .pipe(
        map((res) => ({
          status: res.data.status,
          message: res.data.message,
          otpPolicy: {
            ttlMinutes: res.data.otp_policy.ttl_minutes,
            maxAttempts: res.data.otp_policy.max_attempts,
            cooldownMinutes: res.data.otp_policy.cooldown_minutes,
          },
        }))
      );
  }

  resetPassword(request: ResetPasswordRequest): Observable<ResetPasswordResponse> {
    return this.httpClient
      .post<JsendEnvelope<ResetPasswordGoData>>(this.url('/api/v1/auth/reset-password'), {
        email: request.email,
        otp: request.otp,
        new_password: request.newPassword,
      })
      .pipe(
        map((res) => ({
          status: res.data.status,
          sessionsRevoked: res.data.sessions_revoked,
        }))
      );
  }

  startRegistration(request: StartRegistrationRequest): Observable<StartRegistrationResponse> {
    return this.httpClient
      .post<JsendEnvelope<StartRegistrationGoData>>(this.url('/api/v1/auth/register/start'), request, {
      })
      .pipe(
        map((res) => ({
          flowId: res.data.flow_id,
          status: res.data.status,
          otpPolicy: {
            ttlMinutes: res.data.otp_policy.ttl_minutes,
            maxAttempts: res.data.otp_policy.max_attempts,
            cooldownMinutes: res.data.otp_policy.cooldown_minutes,
          },
        }))
      );
  }

  verifyEmail(request: VerifyEmailRegistrationRequest): Observable<VerifyEmailRegistrationResponse> {
    return this.httpClient
      .post<JsendEnvelope<VerifyEmailGoData>>(this.url('/api/v1/auth/register/verify-email'), {
        flow_id: request.flowId,
        otp: request.otp,
      }, {
      })
      .pipe(
        map((res) => ({
          flowId: res.data.flow_id,
          status: res.data.status,
        }))
      );
  }

  completeRegistration(request: CompleteRegistrationRequest): Observable<CompleteRegistrationResponse> {
    return this.httpClient
      .post<JsendEnvelope<CompleteRegistrationGoData>>(this.url('/api/v1/auth/register/complete'), {
        flow_id: request.flowId,
        first_name: request.firstName,
        last_name: request.lastName,
        identity_document: request.identityDocument,
        tax_id: request.taxId,
        whatsapp_phone: request.whatsappPhone,
        full_address: request.fullAddress,
        password: request.password,
      }, {
      })
      .pipe(
        map((res) => ({
          userId: res.data.user_id,
          status: res.data.status,
          accountType: res.data.account_type,
        }))
      );
  }

  checkDocumentAvailability(identityDocument: string): Observable<CheckDocumentAvailabilityResponse> {
    return this.httpClient
      .post<JsendEnvelope<{ available: boolean; code?: string; message?: string }>>(this.url('/api/v1/auth/register/check-document'), {
        identity_document: identityDocument,
      }, {
      })
      .pipe(
        map((res) => ({
          available: res.data.available,
          code: res.data.code,
          message: res.data.message,
        }))
      );
  }

  private url(path: string): string {
    return `${this.normalizedApiBaseUrl}${path}`;
  }
}
