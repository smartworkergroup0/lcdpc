import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from './core/auth/auth.store';
import { LandingPageComponent } from './pages/landing-page/landing-page.component';
import { RegisterPageComponent } from './pages/register-page/register-page.component';
import { SearchPageComponent } from './pages/search-page/search-page.component';
import { CartPageComponent } from './pages/cart-page/cart-page.component';
import { AdminLayoutComponent } from './pages/admin/admin-layout.component';
import { DashboardPageComponent } from './pages/admin/dashboard/dashboard-page.component';
import { ProductsPageComponent } from './pages/admin/products/products-page.component';
import { BundlesPageComponent } from './pages/admin/bundles/bundles-page.component';
import { OrdersPageComponent } from './pages/admin/orders/orders-page.component';
import { StaffPageComponent } from './pages/admin/staff/staff-page.component';
import { ConfigPageComponent } from './pages/admin/config/config-page.component';
import { adminGuard } from './core/auth/admin.guard';
import { permissionGuard } from './core/auth/permission.guard';

export const routes: Routes = [
	{ path: '', component: LandingPageComponent },
	{ path: 'search', component: SearchPageComponent },
	{ path: 'cart', component: CartPageComponent },
	{ path: 'register', component: RegisterPageComponent },
	{
		path: 'admin',
		component: AdminLayoutComponent,
		canActivate: [adminGuard],
		children: [
			{ path: '', redirectTo: 'dashboard', pathMatch: 'full' },
			{ path: 'dashboard', component: DashboardPageComponent },
			{ path: 'products', component: ProductsPageComponent, canActivate: [permissionGuard('product:view')] },
			{ path: 'bundles', component: BundlesPageComponent, canActivate: [permissionGuard('bundle:view')] },
			{ path: 'orders', component: OrdersPageComponent, canActivate: [permissionGuard('order:view')] },
			{ path: 'staff', component: StaffPageComponent, canActivate: [permissionGuard('staff:view')] },
			{ path: 'config', component: ConfigPageComponent, canActivate: [() => {
				const authStore = inject(AuthStore);
				const router = inject(Router);
				if (authStore.hasAnyPermission('rbac:profile:view', 'category:view', 'price_category:view', 'measurement_unit:view', 'branch:create', 'branch:view', 'system_config:view')) return true;
				return router.createUrlTree(['/admin']);
			}] },
		]
	}
];
