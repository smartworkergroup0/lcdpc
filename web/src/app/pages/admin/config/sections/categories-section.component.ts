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
import { CategoryApiService } from '../../../../core/services/category-api.service';
import { Category, CreateCategoryRequest } from '../../../../core/models/category.model';
import { CategoryFormDialogComponent } from './category-form-dialog.component';

@Component({
  selector: 'app-categories-section',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule,
    ConfirmDialogModule, ToastModule, TooltipModule,
    CategoryFormDialogComponent,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './categories-section.component.html',
})
export class CategoriesSectionComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly categoryApi = inject(CategoryApiService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly canRead = computed(() => this.authStore.hasPermission('category:view'));
  protected readonly canCreate = computed(() => this.authStore.hasPermission('category:create'));
  protected readonly canUpdate = computed(() => this.authStore.hasPermission('category:update'));
  protected readonly canDelete = computed(() => this.authStore.hasPermission('category:delete'));
  protected readonly canModify = computed(() => this.canUpdate() || this.canDelete());

  protected readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(false);
  protected readonly dialogVisible = signal(false);
  protected readonly selectedCategory = signal<Category | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.categoryApi.list().subscribe({
      next: (data) => { this.categories.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openCreate(): void {
    this.selectedCategory.set(null);
    this.dialogVisible.set(true);
  }

  openEdit(category: Category): void {
    this.selectedCategory.set(category);
    this.dialogVisible.set(true);
  }

  onDialogClose(saved: boolean): void {
    this.dialogVisible.set(false);
    this.selectedCategory.set(null);
    if (saved) {
      this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Categoria guardada' });
      this.load();
    }
  }

  confirmDelete(category: Category): void {
    this.confirmationService.confirm({
      message: `Eliminar la categoria "${category.name}"?`,
      header: 'Confirmar eliminacion',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.categoryApi.delete(category.categoryId).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Categoria eliminada' });
            this.load();
          },
          error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar' }),
        });
      },
    });
  }
}
