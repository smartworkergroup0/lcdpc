import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { BranchStore } from '../../core/stores/branch.store';
import { HeaderComponent } from '../../shared/header/header.component';

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
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, HeaderComponent],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss'
})
export class AdminLayoutComponent {
  private readonly authStore = inject(AuthStore);
  private readonly branchStore = inject(BranchStore);

  protected readonly collapsed = signal(true);
  protected readonly almacenExpanded = signal(false);
  protected readonly operacionesExpanded = signal(false);
  protected readonly configExpanded = signal(false);
  protected readonly peopleExpanded = signal(false);
  protected readonly assistantExpanded = signal(false);

  protected readonly branches = this.branchStore.branches;
  protected readonly selectedBranchId = this.branchStore.selectedBranchId;

  protected readonly userName = computed(() => this.authStore.currentUser()?.displayName ?? 'Admin');

  protected readonly canViewSales = computed(() =>
    this.authStore.hasPermission('sales:view')
  );

  protected readonly canViewProducts = computed(() =>
    this.authStore.hasPermission('product:view')
  );
  protected readonly canViewBundles = computed(() =>
    this.authStore.hasPermission('bundle:view')
  );
  protected readonly canViewOrders = computed(() =>
    this.authStore.hasPermission('order:view')
  );
  protected readonly canViewOrderMatrix = computed(() =>
    this.authStore.hasPermission('order:view')
  );
  protected readonly canViewStaff = computed(() =>
    this.authStore.hasPermission('staff:view')
  );
  protected readonly canViewClients = computed(() =>
    this.authStore.hasPermission('client:view')
  );
  protected readonly canViewPeople = computed(() =>
    this.authStore.hasAnyPermission('staff:view', 'client:view')
  );

  protected readonly canViewWorkflows = computed(() =>
    this.authStore.hasPermission('workflow:view')
  );
  protected readonly canViewAlmacen = computed(() =>
    this.authStore.hasAnyPermission('product:view', 'bundle:view')
  );
  protected readonly canViewOperaciones = computed(() =>
    this.authStore.hasAnyPermission('sales:view', 'order:view')
  );
  protected readonly canViewConfig = computed(() =>
    this.authStore.hasAnyPermission('rbac:profile:view', 'category:view', 'price_category:view', 'measurement_unit:view', 'branch:create', 'branch:view', 'system_config:view', 'workflow:view')
  );

  protected readonly canViewAssistant = computed(() =>
    this.authStore.hasPermission('assistant:view')
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
      this.almacenExpanded.set(false);
      this.operacionesExpanded.set(false);
      this.configExpanded.set(false);
      this.peopleExpanded.set(false);
      this.assistantExpanded.set(false);
    }
  }

  protected toggleAlmacen(): void {
    if (this.collapsed()) {
      this.collapsed.set(false);
      this.almacenExpanded.set(true);
    } else {
      this.almacenExpanded.update((v) => !v);
    }
  }

  protected toggleOperaciones(): void {
    if (this.collapsed()) {
      this.collapsed.set(false);
      this.operacionesExpanded.set(true);
    } else {
      this.operacionesExpanded.update((v) => !v);
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

  protected togglePeople(): void {
    if (this.collapsed()) {
      this.collapsed.set(false);
      this.peopleExpanded.set(true);
    } else {
      this.peopleExpanded.update((v) => !v);
    }
  }

  protected toggleAssistant(): void {
    if (this.collapsed()) {
      this.collapsed.set(false);
      this.assistantExpanded.set(true);
    } else {
      this.assistantExpanded.update((v) => !v);
    }
  }

  protected collapseAll(): void {
    this.almacenExpanded.set(false);
    this.operacionesExpanded.set(false);
    this.configExpanded.set(false);
    this.peopleExpanded.set(false);
    this.assistantExpanded.set(false);
  }

  protected onBranchChange(branchId: string): void {
    this.branchStore.selectBranch(branchId);
  }
}
