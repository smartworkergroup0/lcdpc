import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';

export function permissionGuard(permission: string): CanActivateFn {
  return () => {
    const authStore = inject(AuthStore);
    if (authStore.hasPermission(permission)) {
      console.log(`[permissionGuard] Permiso '${permission}' concedido`);
      return true;
    }
    console.warn(`[permissionGuard] Permiso '${permission}' denegado, redirigiendo a /`);
    return inject(Router).createUrlTree(['/']);
  };
}
