import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';

interface SubMenuItem {
  label: string;
  section: string;
  icon: string;
  permission: string;
}

interface MenuGroup {
  label: string;
  icon: string;
  expanded: boolean;
  items: SubMenuItem[];
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss'
})
export class AdminLayoutComponent {
  private readonly authStore = inject(AuthStore);

  protected readonly collapsed = signal(true);
  protected readonly configExpanded = signal(false);

  protected readonly userName = computed(() => this.authStore.currentUser()?.displayName ?? 'Admin');

  protected readonly canViewProducts = computed(() =>
    this.authStore.hasPermission('product:view')
  );
  protected readonly canViewBundles = computed(() =>
    this.authStore.hasPermission('bundle:view')
  );
  protected readonly canViewOrders = computed(() =>
    this.authStore.hasPermission('order:view')
  );
  protected readonly canViewStaff = computed(() =>
    this.authStore.hasPermission('staff:view')
  );

  protected readonly canViewWorkflows = computed(() =>
    this.authStore.hasPermission('order:view')
  );
  protected readonly canViewConfig = computed(() =>
    this.authStore.hasAnyPermission('rbac:profile:view', 'category:view', 'price_category:view', 'measurement_unit:view', 'branch:create', 'branch:view', 'system_config:view')
  );

  protected readonly canViewRbac = computed(() =>
    this.authStore.hasPermission('rbac:profile:view')
  );
  protected readonly canViewInventario = computed(() =>
    this.authStore.hasAnyPermission('category:view', 'price_category:view', 'measurement_unit:view')
  );
  protected readonly canViewAdministracion = computed(() =>
    this.authStore.hasAnyPermission('branch:create', 'branch:view')
  );

  protected readonly canViewSistema = computed(() =>
    this.authStore.hasPermission('system_config:view')
  );

  protected toggleSidebar(): void {
    this.collapsed.update((v) => !v);
    if (this.collapsed()) {
      this.configExpanded.set(false);
    }
  }

  protected toggleConfig(): void {
    if (this.collapsed()) {
      this.collapsed.set(false);
      this.configExpanded.set(true);
    } else {
      this.configExpanded.update((v) => !v);
    }
  }

  protected collapseAll(): void {
    this.configExpanded.set(false);
  }
}
