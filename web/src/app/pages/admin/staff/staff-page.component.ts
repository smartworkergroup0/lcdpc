import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToolbarModule } from 'primeng/toolbar';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthStore } from '../../../core/auth/auth.store';
import { StaffMember } from '../../../core/models/staff.model';
import { StaffApiService } from '../../../core/services/staff-api.service';
import { BranchApiService } from '../../../core/services/branch-api.service';
import { StaffFormDialogComponent } from './staff-form-dialog.component';

@Component({
  selector: 'app-staff-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule, TagModule,
    InputTextModule, FloatLabelModule, IconFieldModule, InputIconModule, SelectModule, ToolbarModule,
    ConfirmDialogModule, ToastModule, TooltipModule, DialogModule,
    StaffFormDialogComponent,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './staff-page.component.html',
  styleUrl: './staff-page.component.scss'
})
export class StaffPageComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly staffApi = inject(StaffApiService);
  private readonly branchApi = inject(BranchApiService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly canCreate = computed(() => this.authStore.hasPermission('staff:create'));
  protected readonly canUpdate = computed(() => this.authStore.hasPermission('staff:update'));
  protected readonly canViewAllBranches = computed(() => this.authStore.hasPermission('view:branch:all'));
  protected readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);

  protected readonly items = signal<StaffMember[]>([]);
  protected readonly loading = signal(false);
  protected readonly totalCount = signal(0);
  protected readonly pageSize = 10;

  protected search = '';

  protected readonly detailVisible = signal(false);
  protected readonly selectedItem = signal<StaffMember | null>(null);
  protected readonly formVisible = signal(false);
  protected readonly editItem = signal<StaffMember | null>(null);
  protected readonly branches = signal<{ id: string; name: string }[]>([]);

  ngOnInit(): void {
    this.loadBranches();
  }

  private loadBranches(): void {
    this.branchApi.listAdmin().subscribe({
      next: (branches) => this.branches.set(branches.map(b => ({ id: b.id, name: b.storeName }))),
      error: () => {},
    });
  }

  loadItems(event: TableLazyLoadEvent): void {
    const offset = event.first ?? 0;
    const limit = event.rows ?? this.pageSize;
    this.loading.set(true);

    const filters: Record<string, string> = {};
    if (this.search.trim()) filters['search'] = this.search.trim();
    if (!this.canViewAllBranches() && this.userBranchId()) {
      filters['branch_id'] = this.userBranchId()!;
    }

    this.staffApi.list({ ...filters, limit, offset } as any).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  applyFilters(): void {
    this.loadItems({ first: 0, rows: this.pageSize });
  }

  statusSeverity(status: string): 'success' | 'danger' | 'secondary' {
    switch (status?.toLowerCase()) {
      case 'active': return 'success';
      case 'inactive': return 'danger';
      default: return 'secondary';
    }
  }

  protected formatDate(value: string): string {
    return new Date(value).toLocaleDateString('es-VE', {
      year: 'numeric', month: 'short', day: '2-digit',
    });
  }

  openDetail(item: StaffMember): void {
    this.selectedItem.set(item);
    this.detailVisible.set(true);
  }

  closeDetail(): void {
    this.detailVisible.set(false);
    this.selectedItem.set(null);
  }

  openCreate(): void {
    this.editItem.set(null);
    this.formVisible.set(true);
  }

  openEdit(item: StaffMember): void {
    this.editItem.set(item);
    this.formVisible.set(true);
  }

  closeForm(): void {
    this.formVisible.set(false);
    this.editItem.set(null);
  }

  onFormSaved(): void {
    this.closeForm();
    this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Miembro guardado correctamente' });
    this.applyFilters();
  }

  confirmDelete(item: StaffMember): void {
    const newStatus = item.status === 'Active' ? 'Inactivo' : 'Activo';
    const action = item.status === 'Active' ? 'inactivar' : 'activar';
    this.confirmationService.confirm({
      message: `¿${action.charAt(0).toUpperCase() + action.slice(1)} a <b>${item.profileName}</b>?`,
      header: `Confirmar ${action}`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: action.charAt(0).toUpperCase() + action.slice(1),
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: item.status === 'Active' ? 'p-button-danger' : '',
      accept: () => this.doToggleStatus(item),
    });
  }

  private doToggleStatus(item: StaffMember): void {
    this.staffApi.toggleStatus(item.userId).subscribe({
      next: () => {
        const action = item.status === 'Active' ? 'inactivado' : 'activado';
        this.messageService.add({ severity: 'success', summary: 'Exito', detail: `Miembro ${action}` });
        this.applyFilters();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cambiar el estado' });
      },
    });
  }
}
