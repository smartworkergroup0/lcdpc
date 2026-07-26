import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';

export const adminGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  if (!authStore.isAuthenticated()) {
    return router.createUrlTree(['/']);
  }

  const adminPermissions = [
    'module:dashboard:view',
    'module:operaciones:view',
    'module:almacen:view',
    'module:personas:view',
    'module:configuracion:view',
    'module:asistente:view',
  ];

  const hasAccess = authStore.hasAnyPermission(...adminPermissions);

  if (hasAccess) {
    return true;
  }

  return router.createUrlTree(['/']);
};
