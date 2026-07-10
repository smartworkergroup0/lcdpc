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
    'product:create', 'product:update', 'product:delete',
    'bundle:create', 'bundle:update', 'bundle:delete',
    'order:view', 'order:create', 'order:update', 'order:delete',
    'rbac:resource:view', 'rbac:role:view', 'rbac:profile:view',
  ];

  if (authStore.hasAnyPermission(...adminPermissions)) {
    return true;
  }

  return router.createUrlTree(['/']);
};
