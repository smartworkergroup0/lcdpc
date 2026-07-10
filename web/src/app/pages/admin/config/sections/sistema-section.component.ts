import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { TabsModule } from 'primeng/tabs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { SystemConfigSectionComponent } from './system-config-section.component';

@Component({
  selector: 'app-sistema-section',
  standalone: true,
  imports: [CommonModule, TabsModule, SystemConfigSectionComponent],
  template: `
    <p-tabs value="general">
      <p-tablist>
        <p-tab value="general">General</p-tab>
      </p-tablist>
      <p-tabpanels>
        <p-tabpanel value="general">
          <app-system-config-section />
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
export class SistemaSectionComponent {
  private readonly authStore = inject(AuthStore);

  protected readonly canViewSystemConfig = computed(() => this.authStore.hasPermission('system_config:view'));
}
