import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';
import { AuthApiService } from '../../pages/auth-page/auth-api-go.service';

const EXPIRES_AT_KEY = 'lcdpc_expires_at';

export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
  status: string;
  accountType: string;
  onboardingStatus: string;
  emailVerifiedAt: string | null;
  profileId: string;
  profileWeight: number;
  branchId: string | null;
}

interface MeGoData {
  authenticated: boolean;
  user: {
    id: string;
    email: string;
    display_name: string;
    status: string;
    account_type: string;
    onboarding_status: string;
    email_verified_at: string | null;
    profile_id: string;
    profile_weight: number;
    branch_id: string | null;
  } | null;
  permissions: string[];
  expires_in: number | null;
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);

  readonly currentUser = signal<UserSummary | null>(null);
  readonly permissions = signal<string[]>([]);
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly isLoaded = signal(false);
  readonly expiresAt = signal<number | null>(null);

  private refreshing = false;
  private refreshResult: Observable<boolean> | null = null;
  private expirationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const saved = localStorage.getItem(EXPIRES_AT_KEY);
    if (saved) {
      const exp = parseInt(saved, 10);
      this.expiresAt.set(exp);
      if (exp > Date.now()) {
        this.scheduleExpiration();
      }
    }
  }

  me(loginContext = false): Observable<void> {
    return this.authApi.me().pipe(
      map((data: MeGoData) => this.applyMeResponse(data, loginContext)),
      catchError((err) => {
        this.clear(loginContext);
        if (loginContext) return throwError(() => err);
        return of(undefined);
      })
    );
  }

  login(email: string, password: string): Observable<void> {
    return this.authApi.login({ email, password }).pipe(
      tap((result) => {
        this.setExpiresAt(Date.now() + result.expiresIn * 1000);
      }),
      switchMap(() => this.me(true)),
      catchError((err) => {
        this.clear(false);
        return throwError(() => err);
      })
    );
  }

  refresh(): Observable<boolean> {
    if (this.refreshing && this.refreshResult) {
      return this.refreshResult;
    }

    if (!localStorage.getItem(EXPIRES_AT_KEY)) {
      return of(false);
    }

    this.refreshing = true;
    this.refreshResult = this.authApi.refresh().pipe(
      map((result) => {
        this.setExpiresAt(Date.now() + result.expiresIn * 1000);
        this.refreshing = false;
        this.refreshResult = null;
        return true;
      }),
      catchError(() => {
        this.clear();
        this.refreshing = false;
        this.refreshResult = null;
        return of(false);
      })
    );

    return this.refreshResult;
  }

  logout(): Observable<void> {
    return this.authApi.logout().pipe(
      tap(() => this.clear()),
      catchError(() => {
        this.clear();
        return of(undefined);
      })
    );
  }

  clear(navigate = true): void {
    this.currentUser.set(null);
    this.permissions.set([]);
    this.expiresAt.set(null);
    localStorage.removeItem(EXPIRES_AT_KEY);
    this.clearExpirationTimer();
    if (navigate) {
      this.router.navigate(['/']);
    }
  }

  hasPermission(resourceCode: string): boolean {
    return this.permissions().includes(resourceCode);
  }

  hasAnyPermission(...resourceCodes: string[]): boolean {
    const perms = this.permissions();
    return resourceCodes.some((code) => perms.includes(code));
  }

  isExpiringSoon(): boolean {
    const exp = this.expiresAt();
    if (!exp) return false;
    return exp - Date.now() < 60_000;
  }

  private applyMeResponse(data: MeGoData, loginContext = false): void {
    if (!data.authenticated || !data.user) {
      this.clear(loginContext);
      if (loginContext) throw new Error('Sesión no autenticada');
      return;
    }

    this.currentUser.set({
      id: data.user.id,
      email: data.user.email,
      displayName: data.user.display_name,
      status: data.user.status,
      accountType: data.user.account_type,
      onboardingStatus: data.user.onboarding_status,
      emailVerifiedAt: data.user.email_verified_at,
      profileId: data.user.profile_id,
      profileWeight: data.user.profile_weight ?? 0,
      branchId: data.user.branch_id ?? null,
    });

    this.permissions.set(data.permissions ?? []);

    console.log('[AuthStore] Permisos cargados:', data.permissions?.length ?? 0);
    console.log('[AuthStore] Permisos module:', (data.permissions ?? []).filter((p: string) => p.startsWith('module:')));

    if (data.expires_in != null) {
      this.setExpiresAt(Date.now() + data.expires_in * 1000);
    }
  }

  private setExpiresAt(exp: number): void {
    this.expiresAt.set(exp);
    localStorage.setItem(EXPIRES_AT_KEY, String(exp));
    this.scheduleExpiration();
  }

  private scheduleExpiration(): void {
    this.clearExpirationTimer();
    const exp = this.expiresAt();
    if (exp === null) return;
    const delay = Math.max(0, exp - Date.now() - 30_000);
    this.expirationTimer = setTimeout(() => {
      this.clear();
    }, delay);
  }

  private clearExpirationTimer(): void {
    if (this.expirationTimer !== null) {
      clearTimeout(this.expirationTimer);
      this.expirationTimer = null;
    }
  }
}
