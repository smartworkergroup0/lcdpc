import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { AuthStore } from './auth.store';

export const authGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  const router = inject(Router);

  if (store.isAuthenticated()) {
    return true;
  }

  // Try to restore session from cookies
  return store.me().pipe(
    take(1),
    map(() => {
      if (store.isAuthenticated()) {
        return true;
      }
      return router.createUrlTree(['/']);
    })
  );
};
