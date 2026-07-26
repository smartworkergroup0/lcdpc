import { inject } from '@angular/core';
import { AuthStore } from './auth.store';
import { catchError, of } from 'rxjs';

const EXPIRES_AT_KEY = 'lcdpc_expires_at';

export function initializeAuth(): () => Promise<void> {
  return () => {
    const store = inject(AuthStore);
    return new Promise<void>((resolve) => {
      const stored = localStorage.getItem(EXPIRES_AT_KEY);
      if (!stored) {
        store.isLoaded.set(true);
        resolve();
        return;
      }

      if (parseInt(stored, 10) <= Date.now()) {
        store.clear(false);
        store.isLoaded.set(true);
        resolve();
        return;
      }

      store.me().pipe(
        catchError(() => of(undefined))
      ).subscribe(() => {
        store.isLoaded.set(true);
        resolve();
      });
    });
  };
}
