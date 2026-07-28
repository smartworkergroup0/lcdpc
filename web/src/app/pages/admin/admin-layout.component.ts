import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
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
  protected readonly mobileOpen = signal(false);
  protected readonly almacenExpanded = signal(false);
  protected readonly operacionesExpanded = signal(false);
  protected readonly configExpanded = signal(false);
  protected readonly peopleExpanded = signal(false);
  protected readonly assistantExpanded = signal(false);

  protected readonly branches = this.branchStore.branches;
  protected readonly selectedBranchId = this.branchStore.selectedBranchId;

  protected readonly userName = computed(() => this.authStore.currentUser()?.displayName ?? 'Admin');

  protected readonly canViewDashboard = computed(() =>
    this.authStore.hasPermission('module:dashboard:view')
  );

  protected readonly canViewOperaciones = computed(() =>
    this.authStore.hasPermission('module:operaciones:view')
  );
  protected readonly canViewAlmacen = computed(() =>
    this.authStore.hasPermission('module:almacen:view')
  );
  protected readonly canViewPeople = computed(() =>
    this.authStore.hasPermission('module:personas:view')
  );
  protected readonly canViewConfig = computed(() =>
    this.authStore.hasPermission('module:configuracion:view')
  );
  protected readonly canViewAssistant = computed(() =>
    this.authStore.hasPermission('module:asistente:view')
  );
  protected readonly canViewAssistantSessions = computed(() =>
    this.authStore.hasPermission('module:assistant_session:view')
  );

  protected readonly canViewSales = computed(() =>
    this.authStore.hasPermission('module:ventas:view')
  );
  protected readonly canViewProducts = computed(() =>
    this.authStore.hasPermission('module:productos:view')
  );
  protected readonly canViewBundles = computed(() =>
    this.authStore.hasPermission('module:combos:view')
  );
  protected readonly canViewOrders = computed(() =>
    this.authStore.hasPermission('module:ordenes:view')
  );
  protected readonly canViewOrderMatrix = computed(() =>
    this.authStore.hasPermission('module:matriz:view')
  );
  protected readonly canViewStaff = computed(() =>
    this.authStore.hasPermission('module:personal:view')
  );
  protected readonly canViewClients = computed(() =>
    this.authStore.hasPermission('module:clientes:view')
  );
  protected readonly canViewWorkflows = computed(() =>
    this.authStore.hasPermission('module:flujos:view')
  );
  protected readonly canViewRbac = computed(() =>
    this.authStore.hasPermission('module:rbac:view')
  );
  protected readonly canViewInventario = computed(() =>
    this.authStore.hasPermission('module:inventario:view')
  );
  protected readonly canViewAdministracion = computed(() =>
    this.authStore.hasPermission('module:administracion:view')
  );
  protected readonly canViewSistema = computed(() =>
    this.authStore.hasPermission('module:sistema:view')
  );

  constructor() {
    effect(() => {
      this.authStore.permissions();
    });
  }

  protected toggleSidebar(): void {
    this.collapsed.update((v) => !v);
    this.collapseAll();
    this.mobileOpen.set(false);
  }

  protected toggleMobileSidebar(): void {
    this.mobileOpen.update((v) => !v);
  }

  protected closeMobileSidebar(): void {
    this.mobileOpen.set(false);
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
