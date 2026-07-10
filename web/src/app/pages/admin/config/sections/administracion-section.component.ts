import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { TabsModule } from 'primeng/tabs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { BranchesSectionComponent } from './branches-section.component';

@Component({
  selector: 'app-administracion-section',
  standalone: true,
  imports: [CommonModule, TabsModule, BranchesSectionComponent],
  template: `
    <p-tabs value="branches">
      <p-tablist>
        <p-tab value="branches">Sedes</p-tab>
      </p-tablist>
      <p-tabpanels>
        <p-tabpanel value="branches">
          <app-branches-section />
        </p-tabpanel>
      </p-tabpanels>
    </p-tabs>
  `,
  styles: [`
    :host {
      display: block;
    }
    :host ::ng-deep .p-tabpanels {
      padding-top: 0.75rem;
    }
  `],
})
export class AdministracionSectionComponent {
  private readonly authStore = inject(AuthStore);

  protected readonly canViewBranches = computed(() => this.authStore.hasAnyPermission('branch:create', 'branch:view'));
}
