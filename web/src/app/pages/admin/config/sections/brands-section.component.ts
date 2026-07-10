import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthStore } from '../../../../core/auth/auth.store';
import { BrandApiService } from '../../../../core/services/brand-api.service';
import { Brand, CreateBrandRequest } from '../../../../core/models/brand.model';
import { BrandFormDialogComponent } from './brand-form-dialog.component';

@Component({
  selector: 'app-brands-section',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule,
    ConfirmDialogModule, ToastModule, TooltipModule,
    BrandFormDialogComponent,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './brands-section.component.html',
})
export class BrandsSectionComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly brandApi = inject(BrandApiService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly canRead = computed(() => this.authStore.hasPermission('brand:view'));
  protected readonly canCreate = computed(() => this.authStore.hasPermission('brand:create'));
  protected readonly canUpdate = computed(() => this.authStore.hasPermission('brand:update'));
  protected readonly canDelete = computed(() => this.authStore.hasPermission('brand:delete'));
  protected readonly canModify = computed(() => this.canUpdate() || this.canDelete());

  protected readonly items = signal<Brand[]>([]);
  protected readonly loading = signal(false);
  protected readonly dialogVisible = signal(false);
  protected readonly selectedItem = signal<Brand | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.brandApi.list().subscribe({
      next: (data) => { this.items.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openCreate(): void {
    this.selectedItem.set(null);
    this.dialogVisible.set(true);
  }

  openEdit(item: Brand): void {
    this.selectedItem.set(item);
    this.dialogVisible.set(true);
  }

  onDialogClose(saved: boolean): void {
    this.dialogVisible.set(false);
    this.selectedItem.set(null);
    if (saved) {
      this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Marca guardada' });
      this.load();
    }
  }

  confirmDelete(item: Brand): void {
    this.confirmationService.confirm({
      message: `Eliminar la marca "${item.name}"?`,
      header: 'Confirmar eliminacion',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.brandApi.delete(item.id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Marca eliminada' });
            this.load();
          },
          error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar' }),
        });
      },
    });
  }
}
