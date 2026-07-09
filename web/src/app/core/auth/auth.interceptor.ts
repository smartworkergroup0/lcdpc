import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { Subject, throwError } from 'rxjs';
import { AuthStore } from './auth.store';

let isRefreshing = false;
let refreshResult$ = new Subject<boolean>();

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(AuthStore);

  // Don't intercept auth endpoints themselves
  if (isAuthEndpoint(req.url)) {
    return next(req);
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401) {
        return throwError(() => error);
      }

      // Already refreshing — queue until done
      if (isRefreshing) {
        return refreshResult$.pipe(
          take(1),
          switchMap((success) => {
            if (!success) {
              return throwError(() => error);
            }
            return next(req);
          })
        );
      }

      isRefreshing = true;

      return store.refresh().pipe(
        switchMap((success) => {
          isRefreshing = false;
          refreshResult$.next(success);

          if (!success) {
            return throwError(() => error);
          }

          return next(req);
        }),
        catchError((refreshError) => {
          isRefreshing = false;
          refreshResult$.next(false);
          return throwError(() => refreshError);
        })
      );
    })
  );
};

function isAuthEndpoint(url: string): boolean {
  return (
    url.includes('/api/v1/auth/login') ||
    url.includes('/api/v1/auth/refresh') ||
    url.includes('/api/v1/auth/register') ||
    url.includes('/api/v1/auth/forgot-password') ||
    url.includes('/api/v1/auth/reset-password')
  );
}
