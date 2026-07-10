import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { AuthStore } from '../../../../core/auth/auth.store';
import { SystemConfigApiService } from '../../../../core/services/system-config-api.service';
import { SystemConfig } from '../../../../core/models/system-config.model';
import { SystemConfigFormDialogComponent } from './system-config-form-dialog.component';

@Component({
  selector: 'app-system-config-section',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule,
    TagModule, ToastModule, TooltipModule, ConfirmDialogModule,
    SystemConfigFormDialogComponent,
  ],
  providers: [ConfirmationService, MessageService],
  template: `
    <div class="section-toolbar">
      @if (canCreate()) {
        <p-button label="Nueva Configuracion" icon="pi pi-plus" (onClick)="openCreate()" />
      }
    </div>

    <p-table [value]="items()" [loading]="loading()" styleClass="admin-table">
      <ng-template pTemplate="header">
        <tr>
          <th>Nombre Pagina</th>
          <th>Titulo</th>
          <th>Logo</th>
          <th>Icono</th>
          <th>Precios en Catalogo</th>
          <th>Estado</th>
          <th>Ultima Actualizacion</th>
          @if (canUpdate()) {
            <th>Acciones</th>
          }
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-item>
        <tr>
          <td>{{ item.pageName }}</td>
          <td>{{ item.title }}</td>
          <td>
            @if (item.logoPath) {
              <img [src]="resolveImageUrl(item.logoPath)" alt="logo" style="max-height: 32px; max-width: 80px;" loading="lazy" />
            } @else {
              <span class="text-muted">-</span>
            }
          </td>
          <td>
            @if (item.iconPath) {
              <img [src]="resolveImageUrl(item.iconPath)" alt="icon" style="max-height: 32px; max-width: 32px;" loading="lazy" />
            } @else {
              <span class="text-muted">-</span>
            }
          </td>
          <td>
            <p-tag [value]="item.showPriceInCatalog ? 'Si' : 'No'" [severity]="item.showPriceInCatalog ? 'success' : 'warn'" />
          </td>
          <td>
            <p-tag [value]="item.active ? 'Activo' : 'Inactivo'" [severity]="item.active ? 'success' : 'danger'" />
          </td>
          <td>{{ item.updatedAt | date:'short' }}</td>
          @if (canUpdate()) {
            <td>
              <div class="row-actions">
                <p-button icon="pi pi-pencil" [text]="true" size="small" pTooltip="Editar" (onClick)="openEdit(item)" />
                @if (!item.active) {
                  <p-button icon="pi pi-check-circle" [text]="true" size="small" severity="success" pTooltip="Activar" (onClick)="activateConfig(item)" />
                }
              </div>
            </td>
          }
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td [attr.colspan]="canUpdate() ? 8 : 7" class="text-center">No hay configuraciones registradas</td>
        </tr>
      </ng-template>
    </p-table>

    <app-system-config-form-dialog
      [visible]="dialogVisible()"
      [entity]="selectedConfig()"
      (visibleChange)="dialogVisible.set($event)"
      (saved)="onDialogSaved()"
      (closed)="onDialogClosed()" />

    <p-confirmDialog />
    <p-toast />
  `,
  styles: [`
    .section-toolbar {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 1rem;
    }
    .row-actions {
      display: flex;
      gap: 0.25rem;
    }
    .text-muted {
      color: var(--text-soft);
      opacity: 0.5;
    }
    .text-center {
      text-align: center;
    }
  `],
})
export class SystemConfigSectionComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly systemConfigApi = inject(SystemConfigApiService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  protected readonly canCreate = computed(() => this.authStore.hasPermission('system_config:update'));
  protected readonly canUpdate = computed(() => this.authStore.hasPermission('system_config:update'));

  protected readonly items = signal<SystemConfig[]>([]);
  protected readonly loading = signal(false);
  protected readonly dialogVisible = signal(false);
  protected readonly selectedConfig = signal<SystemConfig | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.systemConfigApi.list().subscribe({
      next: (data) => { this.items.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openCreate(): void {
    this.selectedConfig.set(null);
    this.dialogVisible.set(true);
  }

  openEdit(item: SystemConfig): void {
    this.selectedConfig.set(item);
    this.dialogVisible.set(true);
  }

  activateConfig(item: SystemConfig): void {
    this.confirmationService.confirm({
      message: `Activar la configuracion "${item.pageName}"? La configuracion actualmente activa sera desactivada.`,
      header: 'Confirmar Activacion',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Activar',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.systemConfigApi.update(item.id, { active: true }).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Configuracion activada' });
            this.load();
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo activar la configuracion' });
          },
        });
      },
    });
  }

  onDialogSaved(): void {
    this.dialogVisible.set(false);
    this.selectedConfig.set(null);
    this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Configuracion guardada' });
    this.load();
  }

  onDialogClosed(): void {
    this.dialogVisible.set(false);
    this.selectedConfig.set(null);
  }

  resolveImageUrl(img: string | null): string | null {
    return this.systemConfigApi.resolveImageUrl(img);
  }
}
