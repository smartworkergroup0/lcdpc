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
import { PriceCategoryApiService } from '../../../../core/services/price-category-api.service';
import { PriceCategory, CreatePriceCategoryRequest } from '../../../../core/models/price-category.model';
import { PriceCategoryFormDialogComponent } from './price-category-form-dialog.component';

@Component({
  selector: 'app-price-categories-section',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule,
    ConfirmDialogModule, ToastModule, TooltipModule,
    PriceCategoryFormDialogComponent,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './price-categories-section.component.html',
})
export class PriceCategoriesSectionComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly priceCategoryApi = inject(PriceCategoryApiService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly canRead = computed(() => this.authStore.hasPermission('price_category:view'));
  protected readonly canCreate = computed(() => this.authStore.hasPermission('price_category:create'));
  protected readonly canUpdate = computed(() => this.authStore.hasPermission('price_category:update'));
  protected readonly canDelete = computed(() => this.authStore.hasPermission('price_category:delete'));
  protected readonly canModify = computed(() => this.canUpdate() || this.canDelete());

  protected readonly items = signal<PriceCategory[]>([]);
  protected readonly loading = signal(false);
  protected readonly dialogVisible = signal(false);
  protected readonly selectedItem = signal<PriceCategory | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.priceCategoryApi.list().subscribe({
      next: (data) => { this.items.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openCreate(): void {
    this.selectedItem.set(null);
    this.dialogVisible.set(true);
  }

  openEdit(item: PriceCategory): void {
    this.selectedItem.set(item);
    this.dialogVisible.set(true);
  }

  onDialogClose(saved: boolean): void {
    this.dialogVisible.set(false);
    this.selectedItem.set(null);
    if (saved) {
      this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Categoria de precio guardada' });
      this.load();
    }
  }

  confirmDelete(item: PriceCategory): void {
    this.confirmationService.confirm({
      message: `Eliminar la categoria de precio "${item.name}"?`,
      header: 'Confirmar eliminacion',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.priceCategoryApi.delete(item.id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Categoria de precio eliminada' });
            this.load();
          },
          error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar' }),
        });
      },
    });
  }
}
