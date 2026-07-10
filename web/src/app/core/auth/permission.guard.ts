import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';

export function permissionGuard(permission: string): CanActivateFn {
  return () => {
    const authStore = inject(AuthStore);
    if (authStore.hasPermission(permission)) return true;
    return inject(Router).createUrlTree(['/admin']);
  };
}
