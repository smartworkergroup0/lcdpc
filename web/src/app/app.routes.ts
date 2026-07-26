import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from './core/auth/auth.store';
import { LandingPageComponent } from './pages/landing-page/landing-page.component';
import { RegisterPageComponent } from './pages/register-page/register-page.component';
import { LoginPageComponent } from './pages/auth-page/login-page.component';
import { SearchPageComponent } from './pages/search-page/search-page.component';
import { CartPageComponent } from './pages/cart-page/cart-page.component';
import { AdminLayoutComponent } from './pages/admin/admin-layout.component';
import { DashboardPageComponent } from './pages/admin/dashboard/dashboard-page.component';
import { ProductsPageComponent } from './pages/admin/products/products-page.component';
import { BundlesPageComponent } from './pages/admin/bundles/bundles-page.component';
import { OrdersPageComponent } from './pages/admin/orders/orders-page.component';
import { OrderMatrixPageComponent } from './pages/admin/orders-matrix/order-matrix-page.component';
import { StaffPageComponent } from './pages/admin/staff/staff-page.component';
import { ClientsPageComponent } from './pages/admin/clients/clients-page.component';
import { ConfigPageComponent } from './pages/admin/config/config-page.component';
import { WorkflowEditorPageComponent } from './pages/admin/workflows/workflow-editor-page.component';
import { ExternalAssistantLayoutComponent } from './pages/admin/external-assistant/external-assistant-layout.component';
import { AssistantLeadsPageComponent } from './pages/admin/external-assistant/leads/leads-page.component';
import { AssistantOrdersPageComponent } from './pages/admin/external-assistant/orders/orders-page.component';
import { SalesPageComponent } from './pages/admin/sales/sales-page.component';
import { adminGuard } from './core/auth/admin.guard';
import { permissionGuard } from './core/auth/permission.guard';

export const routes: Routes = [
	{ path: '', component: LandingPageComponent },
	{ path: 'search', component: SearchPageComponent },
	{ path: 'cart', component: CartPageComponent },
	{ path: 'login', component: LoginPageComponent },
	{ path: 'register', component: RegisterPageComponent },
	{
		path: 'admin',
		component: AdminLayoutComponent,
		canActivate: [adminGuard],
		children: [
			{ path: '', redirectTo: 'dashboard', pathMatch: 'full' },
			{ path: 'dashboard', component: DashboardPageComponent, canActivate: [permissionGuard('module:dashboard:view')] },
			{ path: 'products', component: ProductsPageComponent, canActivate: [permissionGuard('module:productos:view')] },
			{ path: 'bundles', component: BundlesPageComponent, canActivate: [permissionGuard('module:combos:view')] },
			{ path: 'orders', component: OrdersPageComponent, canActivate: [permissionGuard('module:ordenes:view')] },
			{ path: 'sales', component: SalesPageComponent, canActivate: [permissionGuard('module:ventas:view')] },
			{ path: 'orders-matrix', component: OrderMatrixPageComponent, canActivate: [permissionGuard('module:matriz:view')] },
			{ path: 'workflows', component: WorkflowEditorPageComponent, canActivate: [permissionGuard('module:flujos:view')] },
			{ path: 'staff', component: StaffPageComponent, canActivate: [permissionGuard('module:personal:view')] },
			{ path: 'clients', component: ClientsPageComponent, canActivate: [permissionGuard('module:clientes:view')] },
			{ path: 'config', component: ConfigPageComponent, canActivate: [() => {
				const authStore = inject(AuthStore);
				const router = inject(Router);
				if (authStore.hasAnyPermission('module:rbac:view', 'module:inventario:view', 'module:administracion:view', 'module:sistema:view')) return true;
				return router.createUrlTree(['/admin']);
			}] },
			{
				path: 'external-assistant',
				component: ExternalAssistantLayoutComponent,
				canActivate: [permissionGuard('module:asistente:view')],
				children: [
					{ path: 'leads', component: AssistantLeadsPageComponent },
					{ path: 'orders', component: AssistantOrdersPageComponent },
					{ path: '', redirectTo: 'leads', pathMatch: 'full' },
				],
			},
		]
	}
];
