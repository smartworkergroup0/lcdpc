import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';

export const adminGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  if (!authStore.isAuthenticated()) {
    console.warn('[adminGuard] Usuario no autenticado, redirigiendo a /');
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

  const userPermissions = authStore.permissions();
  const hasAccess = authStore.hasAnyPermission(...adminPermissions);

  if (!hasAccess) {
    console.warn('[adminGuard] Acceso denegado a /admin/');
    console.warn('[adminGuard] Permisos requeridos (al menos uno):', adminPermissions);
    console.warn('[adminGuard] Permisos del usuario:', userPermissions);
    console.warn('[adminGuard] Permisos de módulo encontrados:', userPermissions.filter(p => p.startsWith('module:')));
  }

  if (hasAccess) {
    console.log('[adminGuard] Acceso permitido a /admin/');
    return true;
  }

  return router.createUrlTree(['/']);
};
