import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL, AuthApiService } from './auth-api.service';

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

  it('calls login endpoint with credentials', () => {
    service.login({ email: 'admin@lcdpc.local', password: 'AdminSeedP@ss1' }).subscribe();

    const req = httpMock.expectOne('http://localhost:8080/api/v1/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.body).toEqual({
      email: 'admin@lcdpc.local',
      password: 'AdminSeedP@ss1'
    });

    req.flush({ tokenPair: null, userSummary: null, permissions: [] });
  });

  it('calls me endpoint with bearer token and credentials', () => {
    service.me('access-token').subscribe();

    const req = httpMock.expectOne('http://localhost:8080/api/v1/auth/me');
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-token');

    req.flush({ authenticated: true, userSummary: null, permissions: [], expiresInSeconds: 3600, scopes: [] });
  });

  it('calls refresh endpoint with credentials', () => {
    service.refresh().subscribe();

    const req = httpMock.expectOne('http://localhost:8080/api/v1/auth/refresh');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.body).toEqual({});

    req.flush({ tokenPair: null, userSummary: null, permissions: [] });
  });

  it('calls logout endpoint with credentials', () => {
    service.logout().subscribe();

    const req = httpMock.expectOne('http://localhost:8080/api/v1/auth/logout');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.body).toEqual({});

    req.flush({});
  });

  it('calls start registration endpoint with credentials', () => {
    service.startRegistration({ email: 'nuevo@lcdpc.local' }).subscribe();

    const req = httpMock.expectOne('http://localhost:8080/api/v1/auth/register/start');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.body).toEqual({ email: 'nuevo@lcdpc.local' });

    req.flush({ flowId: 'f1', status: 'otp_pending', otpPolicy: { ttlMinutes: 10, maxAttempts: 5, cooldownMinutes: 1 } });
  });

  it('calls verify email endpoint with credentials', () => {
    service.verifyEmail({ flowId: 'f1', otp: '123456' }).subscribe();

    const req = httpMock.expectOne('http://localhost:8080/api/v1/auth/register/verify-email');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.body).toEqual({ flowId: 'f1', otp: '123456' });

    req.flush({ flowId: 'f1', status: 'email_verified' });
  });

  it('calls complete profile endpoint with credentials', () => {
    service.completeProfile({
      flowId: 'f1',
      nombres: 'Jose',
      apellidos: 'Perez',
      documentoIdentidad: 'V12345678',
      rif: null,
      telefonoWhatsApp: '04121234567',
      direccionCompleta: 'Caracas',
      password: 'Secret123!'
    }).subscribe();

    const req = httpMock.expectOne('http://localhost:8080/api/v1/auth/register/profile');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.body.flowId).toBe('f1');
    expect(req.request.body.documentoIdentidad).toBe('V12345678');

    req.flush({ usuarioId: 'u1', estado: 'activo', tipoCuenta: 'cliente' });
  });
});
