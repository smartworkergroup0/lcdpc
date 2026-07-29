import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ToolbarModule } from 'primeng/toolbar';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchApiService } from '../../../core/services/branch-api.service';
import { ProductApiService } from '../../../core/services/product-api.service';
import { CategoryStore } from '../../../core/stores/category.store';
import { Product } from '../../../core/models/product.model';
import { ProductFormDialogComponent } from './product-form-dialog.component';

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule, TagModule,
    SelectModule, InputTextModule, IconFieldModule, InputIconModule,
    ToolbarModule, ConfirmDialogModule, ToastModule, TooltipModule,
    ProductFormDialogComponent
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './products-page.component.html',
  styleUrl: './products-page.component.scss'
})
export class ProductsPageComponent implements OnInit, OnDestroy {
  private readonly authStore = inject(AuthStore);
  private readonly productApi = inject(ProductApiService);
  private readonly branchApi = inject(BranchApiService);
  readonly categoryStore = inject(CategoryStore);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly destroy$ = new Subject<void>();
  private readonly searchSubject = new Subject<void>();

  protected readonly canCreate = computed(() => this.authStore.hasPermission('product:create'));
  protected readonly canUpdate = computed(() => this.authStore.hasPermission('product:update'));
  protected readonly canDelete = computed(() => this.authStore.hasPermission('product:delete'));
  protected readonly canViewAllBranches = computed(() => this.authStore.hasPermission('view:branch:all'));
  protected readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);

  protected readonly products = signal<Product[]>([]);
  protected readonly loading = signal(false);
  protected readonly totalCount = signal(0);
  protected readonly pageSize = 10;

  protected filterName = '';
  protected filterCategoryId: string | null = null;
  protected filterIsActive: boolean | null = null;
  protected selectedBranch: string | null = null;

  protected readonly branches = signal<{ id: string; name: string }[]>([]);
  protected readonly activeOptions = [
    { label: 'Activo', value: true },
    { label: 'Inactivo', value: false },
  ];

  protected readonly dialogVisible = signal(false);
  protected readonly selectedProduct = signal<Product | null>(null);

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(1000),
      takeUntil(this.destroy$)
    ).subscribe(() => this.applyFilters());

    this.categoryStore.load();
    this.branchApi.listAdmin().subscribe({
      next: (branches) => {
        this.branches.set(branches.map(b => ({ id: b.id, name: b.storeName })));
        if (this.canViewAllBranches() && !this.selectedBranch) {
          const preferred = this.userBranchId();
          if (preferred && branches.some(b => b.id === preferred)) {
            this.selectedBranch = preferred;
          } else if (branches.length > 0) {
            this.selectedBranch = branches[0].id;
          }
        }
      },
      error: () => {},
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.searchSubject.complete();
  }

  onSearchChange(): void {
    this.searchSubject.next();
  }

  loadProducts(event: any): void {
    const offset = event.first ?? 0;
    const limit = event.rows ?? this.pageSize;

    if (!this.canViewAllBranches() && !this.userBranchId()) {
      this.products.set([]);
      this.totalCount.set(0);
      return;
    }

    this.loading.set(true);

    const filter: Record<string, any> = { limit, offset };
    if (this.filterName) filter['name'] = this.filterName;
    if (this.filterCategoryId) filter['category_id'] = this.filterCategoryId;
    if (this.filterIsActive !== null) filter['is_active'] = this.filterIsActive;
    if (this.selectedBranch) {
      filter['branch_id'] = this.selectedBranch;
    } else if (!this.canViewAllBranches() && this.userBranchId()) {
      filter['branch_id'] = this.userBranchId();
    }

    this.productApi.list(filter).subscribe({
      next: (res) => {
        this.products.set(res.items);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  applyFilters(): void {
    this.loadProducts({ first: 0, rows: this.pageSize });
  }

  resolveImage(img: string | null): string {
    return this.productApi.resolveImageUrl(img) ?? '/not-found.png';
  }

  getCategoryName(categoryId: string | null): string {
    return this.categoryStore.getCategoryName(categoryId);
  }

  onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = '/not-found.png';
  }

  openCreateDialog(): void {
    this.selectedProduct.set(null);
    this.dialogVisible.set(true);
  }

  openEditDialog(product: Product): void {
    this.selectedProduct.set(product);
    this.dialogVisible.set(true);
  }

  onDialogClose(saved: boolean): void {
    this.dialogVisible.set(false);
    this.selectedProduct.set(null);
    if (saved) {
      this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Producto guardado correctamente' });
      this.applyFilters();
    }
  }

  confirmDelete(product: Product): void {
    this.confirmationService.confirm({
      message: `Eliminar producto "${product.name}"?`,
      header: 'Confirmar eliminacion',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.productApi.delete(product.productId).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Producto eliminado' });
            this.applyFilters();
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar el producto' });
          },
        });
      },
    });
  }

  toggleActive(product: Product): void {
    const newStatus = !product.isActive;
    const action = newStatus ? 'activar' : 'desactivar';
    this.confirmationService.confirm({
      message: `${action.charAt(0).toUpperCase() + action.slice(1)} producto "${product.name}"?`,
      header: `Confirmar ${action}`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: action.charAt(0).toUpperCase() + action.slice(1),
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: newStatus ? '' : 'p-button-danger',
      accept: () => {
        this.productApi.toggleActive(product.productId).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: 'Exito',
              detail: `Producto ${newStatus ? 'activado' : 'desactivado'}`,
            });
            this.applyFilters();
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: `No se pudo ${action} el producto` });
          },
        });
      },
    });
  }
}
