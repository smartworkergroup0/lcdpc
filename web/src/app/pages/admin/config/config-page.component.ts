import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth.store';
import { RbacSectionComponent } from './sections/rbac-section.component';
import { InventarioSectionComponent } from './sections/inventario-section.component';
import { AdministracionSectionComponent } from './sections/administracion-section.component';
import { SistemaSectionComponent } from './sections/sistema-section.component';

type ConfigSection = 'rbac' | 'inventario' | 'administracion' | 'sistema';

@Component({
  selector: 'app-config-page',
  standalone: true,
  imports: [
    CommonModule,
    RbacSectionComponent, InventarioSectionComponent, AdministracionSectionComponent,
    SistemaSectionComponent,
  ],
  templateUrl: './config-page.component.html',
  styleUrl: './config-page.component.scss',
})
export class ConfigPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authStore = inject(AuthStore);

  protected readonly activeSection = signal<ConfigSection>('rbac');

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

  protected readonly visibleSections = computed(() => {
    const result: ConfigSection[] = [];
    if (this.canViewRbac()) result.push('rbac');
    if (this.canViewInventario()) result.push('inventario');
    if (this.canViewAdministracion()) result.push('administracion');
    if (this.canViewSistema()) result.push('sistema');
    return result;
  });

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const section = params.get('section') as ConfigSection | null;
      if (section && (section === 'rbac' || section === 'inventario' || section === 'administracion' || section === 'sistema')) {
        this.activeSection.set(section);
      } else {
        const first = this.visibleSections()[0];
        if (first) {
          this.activeSection.set(first);
          this.router.navigate([], {
            queryParams: { section: first },
            queryParamsHandling: 'merge',
            replaceUrl: true,
          });
        }
      }
    });
  }

  protected selectSection(key: ConfigSection): void {
    this.activeSection.set(key);
    this.router.navigate([], {
      queryParams: { section: key },
      queryParamsHandling: 'merge',
    });
  }

  protected getSectionTitle(): string {
    switch (this.activeSection()) {
      case 'rbac': return 'RBAC';
      case 'inventario': return 'Inventario';
      case 'administracion': return 'Administracion';
      case 'sistema': return 'Sistema';
      default: return '';
    }
  }
}
