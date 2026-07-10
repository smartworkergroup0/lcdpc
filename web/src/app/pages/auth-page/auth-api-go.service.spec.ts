import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL, AuthApiService } from './auth-api-go.service';

describe('AuthApiService', () => {
  let service: AuthApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: API_BASE_URL,
          useValue: 'http://localhost:8080'
        }
      ]
    });

    service = TestBed.inject(AuthApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('calls login endpoint and unwraps JSend', () => {
    service.login({ email: 'admin@lcdpc.local', password: 'AdminSeedP@ss1' }).subscribe((result) => {
      expect(result.accessToken).toBe('at-123');
      expect(result.refreshToken).toBe('rt-456');
      expect(result.expiresIn).toBe(3600);
    });

    const req = httpMock.expectOne('http://localhost:8080/api/v1/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.body).toEqual({
      email: 'admin@lcdpc.local',
      password: 'AdminSeedP@ss1'
    });

    req.flush({
      status: 'success',
      data: { access_token: 'at-123', refresh_token: 'rt-456', expires_in: 3600 }
    });
  });

  it('calls me endpoint and unwraps JSend', () => {
    service.me().subscribe((data) => {
      expect(data.authenticated).toBeTrue();
    });

    const req = httpMock.expectOne('http://localhost:8080/api/v1/auth/me');
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBeTrue();

    req.flush({
      status: 'success',
      data: { authenticated: true, user: null, permissions: [], expires_in: null }
    });
  });

  it('calls refresh endpoint and unwraps JSend', () => {
    service.refresh().subscribe((result) => {
      expect(result.accessToken).toBe('new-at');
    });

    const req = httpMock.expectOne('http://localhost:8080/api/v1/auth/refresh');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBeTrue();

    req.flush({
      status: 'success',
      data: { access_token: 'new-at', refresh_token: 'new-rt', expires_in: 3600 }
    });
  });

  it('calls logout endpoint with credentials', () => {
    service.logout().subscribe();

    const req = httpMock.expectOne('http://localhost:8080/api/v1/auth/logout');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBeTrue();

    req.flush({});
  });

  it('calls start registration and maps snake_case to camelCase', () => {
    service.startRegistration({ email: 'nuevo@lcdpc.local' }).subscribe((result) => {
      expect(result.flowId).toBe('f1');
      expect(result.status).toBe('pending_email_verification');
      expect(result.otpPolicy.ttlMinutes).toBe(10);
      expect(result.otpPolicy.maxAttempts).toBe(5);
    });

    const req = httpMock.expectOne('http://localhost:8080/api/v1/auth/register/start');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.body).toEqual({ email: 'nuevo@lcdpc.local' });

    req.flush({
      status: 'success',
      data: {
        flow_id: 'f1',
        status: 'pending_email_verification',
        otp_policy: { ttl_minutes: 10, max_attempts: 5, cooldown_minutes: 10 }
      }
    });
  });

  it('calls verify email with snake_case body', () => {
    service.verifyEmail({ flowId: 'f1', otp: '123456' }).subscribe((result) => {
      expect(result.flowId).toBe('f1');
      expect(result.status).toBe('pending_profile');
    });

    const req = httpMock.expectOne('http://localhost:8080/api/v1/auth/register/verify-email');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.body).toEqual({ flow_id: 'f1', otp: '123456' });

    req.flush({
      status: 'success',
      data: { flow_id: 'f1', status: 'pending_profile' }
    });
  });

  it('calls complete registration with snake_case body', () => {
    service.completeRegistration({
      flowId: 'f1',
      firstName: 'Jose',
      lastName: 'Perez',
      identityDocument: 'V12345678',
      taxId: null,
      whatsappPhone: '04121234567',
      fullAddress: 'Caracas',
      password: 'Secret123!'
    }).subscribe((result) => {
      expect(result.userId).toBe('u1');
      expect(result.status).toBe('active');
    });

    const req = httpMock.expectOne('http://localhost:8080/api/v1/auth/register/complete');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.body.flow_id).toBe('f1');
    expect(req.request.body.identity_document).toBe('V12345678');

    req.flush({
      status: 'success',
      data: { user_id: 'u1', status: 'active', account_type: 'client' }
    });
  });
});
