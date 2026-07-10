import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import { BundleApiService } from '../../../core/services/bundle-api.service';
import { CategoryStore } from '../../../core/stores/category.store';
import { Bundle } from '../../../core/models/bundle.model';
import { BundleFormDialogComponent } from './bundle-form-dialog.component';

@Component({
  selector: 'app-bundles-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule, TagModule,
    SelectModule, InputTextModule, IconFieldModule, InputIconModule,
    ToolbarModule, ConfirmDialogModule, ToastModule, TooltipModule,
    BundleFormDialogComponent
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './bundles-page.component.html',
  styleUrl: './bundles-page.component.scss'
})
export class BundlesPageComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly bundleApi = inject(BundleApiService);
  readonly categoryStore = inject(CategoryStore);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly canCreate = computed(() => this.authStore.hasPermission('bundle:create'));
  protected readonly canUpdate = computed(() => this.authStore.hasPermission('bundle:update'));
  protected readonly canDelete = computed(() => this.authStore.hasPermission('bundle:delete'));
  protected readonly canViewAllBranches = computed(() => this.authStore.hasPermission('view:branch:all'));
  protected readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);

  protected readonly bundles = signal<Bundle[]>([]);
  protected readonly loading = signal(false);
  protected readonly totalCount = signal(0);
  protected readonly pageSize = 10;

  protected filterName = '';
  protected filterCode = '';
  protected filterStatus: string | null = null;
  protected filterCategoryId: string | null = null;

  protected readonly statusOptions = [
    { label: 'Activo', value: 'Active' },
    { label: 'Inactivo', value: 'Inactive' },
  ];

  protected readonly dialogVisible = signal(false);
  protected readonly selectedBundle = signal<Bundle | null>(null);

  ngOnInit(): void {
    this.categoryStore.load();
  }

  loadBundles(event: any): void {
    const offset = event.first ?? 0;
    const limit = event.rows ?? this.pageSize;
    this.loading.set(true);

    const filter: Record<string, any> = { limit, offset };
    if (this.filterName) filter['name'] = this.filterName;
    if (this.filterCode) filter['code'] = this.filterCode;
    if (this.filterStatus) filter['status'] = this.filterStatus;
    if (this.filterCategoryId) filter['category_id'] = this.filterCategoryId;
    if (!this.canViewAllBranches() && this.userBranchId()) {
      filter['branch_id'] = this.userBranchId();
    }

    this.bundleApi.list(filter).subscribe({
      next: (res) => {
        this.bundles.set(res.items);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  applyFilters(): void {
    this.loadBundles({ first: 0, rows: this.pageSize });
  }

  resolveImage(img: string | null): string {
    return this.bundleApi.resolveImageUrl(img) ?? '/not-found.png';
  }

  getCategoryName(categoryId: string | null): string {
    return this.categoryStore.getCategoryName(categoryId);
  }

  onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = '/not-found.png';
  }

  statusSeverity(status: string): 'info' | 'success' | 'warn' | 'danger' {
    switch (status) {
      case 'Active': return 'success';
      case 'Inactive': return 'warn';
      default: return 'info';
    }
  }

  openCreateDialog(): void {
    this.selectedBundle.set(null);
    this.dialogVisible.set(true);
  }

  openEditDialog(bundle: Bundle): void {
    this.bundleApi.getById(bundle.bundleId).subscribe({
      next: (fresh) => {
        this.selectedBundle.set(fresh);
        this.dialogVisible.set(true);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el combo' });
      },
    });
  }

  onDialogClose(saved: boolean): void {
    this.dialogVisible.set(false);
    this.selectedBundle.set(null);
    if (saved) {
      this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Combo guardado correctamente' });
      this.applyFilters();
    }
  }

  toggleActive(bundle: Bundle): void {
    this.bundleApi.toggleActive(bundle.bundleId).subscribe({
      next: () => {
        const msg = bundle.status === 'Active' ? 'Combo desactivado' : 'Combo activado';
        this.messageService.add({ severity: 'success', summary: 'Exito', detail: msg });
        this.applyFilters();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cambiar el estado del combo' });
      },
    });
  }

  confirmDelete(bundle: Bundle): void {
    this.confirmationService.confirm({
      message: `Eliminar combo "${bundle.name}"?`,
      header: 'Confirmar eliminacion',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.bundleApi.delete(bundle.bundleId).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Combo eliminado' });
            this.applyFilters();
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar el combo' });
          },
        });
      },
    });
  }
}
