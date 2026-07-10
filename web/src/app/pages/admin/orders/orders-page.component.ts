import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputGroupModule } from 'primeng/inputgroup';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthStore } from '../../../core/auth/auth.store';
import { OrderApiService } from '../../../core/services/order-api.service';
import { BranchApiService } from '../../../core/services/branch-api.service';
import { Order, ORDER_STATUS_LABELS, ORDER_STATUS_SEVERITY, ORDER_STATUS_TRANSITIONS, ORDER_TERMINAL_STATUSES } from '../../../core/models/order.model';
import { OrderDetailDialogComponent } from './order-detail-dialog.component';
import { OrderFormDialogComponent } from './order-form-dialog.component';
import { OrderItemsDialogComponent } from './order-items-dialog.component';

@Component({
  selector: 'app-orders-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule, TagModule,
    SelectModule, InputTextModule, InputGroupModule, DialogModule, ConfirmDialogModule,
    ToastModule, TooltipModule, OrderDetailDialogComponent, OrderFormDialogComponent, OrderItemsDialogComponent
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './orders-page.component.html',
  styleUrl: './orders-page.component.scss'
})
export class OrdersPageComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly orderApi = inject(OrderApiService);
  private readonly branchApi = inject(BranchApiService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly canView = computed(() => this.authStore.hasPermission('order:view'));
  protected readonly canCreate = computed(() => this.authStore.hasPermission('order:create'));
  protected readonly canDelete = computed(() => this.authStore.hasPermission('order:delete'));
  protected readonly canChangeStatus = computed(() => this.authStore.hasPermission('order:status:change'));
  protected readonly canViewAllBranches = computed(() => this.authStore.hasPermission('view:branch:all'));
  protected readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);

  protected readonly orders = signal<Order[]>([]);
  protected readonly branches = signal<{ id: string; name: string }[]>([]);
  protected readonly loading = signal(false);
  protected readonly totalCount = signal(0);
  protected readonly pageSize = 10;

  protected selectedStatus: string | null = null;
  protected selectedBranch: string | null = null;
  protected searchDisplayId: string = '';

  protected readonly statusOptions = Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({ label, value }));
  protected readonly ORDER_STATUS_TRANSITIONS = ORDER_STATUS_TRANSITIONS;

  protected readonly detailVisible = signal(false);
  protected readonly selectedOrder = signal<Order | null>(null);
  protected readonly createDialogVisible = signal(false);
  protected readonly itemsDialogVisible = signal(false);

  protected readonly statusDialogVisible = signal(false);
  protected readonly nextStatusOptions = signal<{ label: string; value: string }[]>([]);
  protected newStatus = '';
  protected statusNotes = '';

  ngOnInit(): void {
    this.branchApi.listAdmin().subscribe({
      next: (branches) => this.branches.set(branches.map((b) => ({ id: b.id, name: b.storeName }))),
    });
  }

  loadOrders(event: any): void {
    const offset = event.first ?? 0;
    const limit = event.rows ?? this.pageSize;
    this.loading.set(true);

    const filter: Record<string, any> = { limit, offset };
    if (this.selectedStatus) filter['status'] = this.selectedStatus;
    if (this.searchDisplayId.trim()) filter['display_id'] = this.searchDisplayId.trim();
    if (this.selectedBranch) {
      filter['branch_id'] = this.selectedBranch;
    } else if (!this.canViewAllBranches() && this.userBranchId()) {
      filter['branch_id'] = this.userBranchId();
    }

    this.orderApi.list(filter).subscribe({
      next: (res) => {
        this.orders.set(res.items);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  applyFilters(): void {
    this.loadOrders({ first: 0, rows: this.pageSize });
  }

  getBranchName(branchId: string): string {
    return this.branches().find((b) => b.id === branchId)?.name ?? branchId.slice(0, 8);
  }

  orderStatusLabel(status: string): string {
    return ORDER_STATUS_LABELS[status] ?? status;
  }

  orderStatusSeverity(status: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' {
    return ORDER_STATUS_SEVERITY[status] ?? 'info';
  }

  isTerminal(status: string): boolean {
    return !!ORDER_TERMINAL_STATUSES[status];
  }

  isInitialStatus(status: string): boolean {
    return status === 'PENDING_REVIEW';
  }

  viewDetail(order: Order): void {
    this.selectedOrder.set(order);
    this.detailVisible.set(true);
  }

  viewItems(): void {
    const order = this.selectedOrder();
    if (!order) return;
    this.detailVisible.set(false);
    this.orderApi.getById(order.id).subscribe({
      next: (fullOrder) => {
        this.selectedOrder.set(fullOrder);
        this.itemsDialogVisible.set(true);
      },
      error: () => {
        this.itemsDialogVisible.set(true);
      },
    });
  }

  onItemsBack(): void {
    this.itemsDialogVisible.set(false);
    this.detailVisible.set(true);
  }

  onItemsSaved(): void {
    this.itemsDialogVisible.set(false);
    this.applyFilters();
    const order = this.selectedOrder();
    if (order) {
      this.orderApi.getById(order.id).subscribe({
        next: (fullOrder) => {
          this.selectedOrder.set(fullOrder);
          this.detailVisible.set(true);
        },
        error: () => {
          this.detailVisible.set(true);
        },
      });
    }
  }

  openStatusDialog(order: Order): void {
    this.selectedOrder.set(order);
    this.newStatus = '';
    this.statusNotes = '';

    const allowed = ORDER_STATUS_TRANSITIONS[order.status] ?? [];
    this.nextStatusOptions.set(allowed.map((s) => ({ label: ORDER_STATUS_LABELS[s] ?? s, value: s })));
    this.statusDialogVisible.set(true);
  }

  changeStatus(): void {
    if (!this.newStatus || !this.selectedOrder()) return;

    this.orderApi.changeStatus(this.selectedOrder()!.id, {
      to_status: this.newStatus,
      notes: this.statusNotes,
    }).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Estado actualizado' });
        this.statusDialogVisible.set(false);
        this.applyFilters();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cambiar el estado' });
      },
    });
  }

  openCreateDialog(): void {
    this.createDialogVisible.set(true);
  }

  onOrderCreated(): void {
    this.createDialogVisible.set(false);
    this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Orden creada exitosamente' });
    this.applyFilters();
  }

  confirmDelete(order: Order): void {
    this.confirmationService.confirm({
      message: `Eliminar orden ${order.displayId}?`,
      header: 'Confirmar eliminacion',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.orderApi.delete(order.id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Orden eliminada' });
            this.applyFilters();
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar la orden' });
          },
        });
      },
    });
  }
}
