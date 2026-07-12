import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DrawerModule } from 'primeng/drawer';
import { ProgressBarModule } from 'primeng/progressbar';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';

import { AuthStore } from '../../../core/auth/auth.store';
import {
  MatrixFilter,
  Order,
  ORDER_STATUS_COLUMNS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_SEVERITY,
  ORDER_STATUS_TRANSITIONS,
  ORDER_TERMINAL_STATUSES,
  OrderWithHistory,
  StatusHistoryEntry,
} from '../../../core/models/order.model';
import { OrderApiService } from '../../../core/services/order-api.service';
import { BranchApiService } from '../../../core/services/branch-api.service';

type CellType = 'completed' | 'active' | 'pending' | 'terminal' | 'reverted' | 'unreachable';

interface CellInfo {
  type: CellType;
  clickable: boolean;
}

@Component({
  selector: 'app-order-matrix-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DatePickerModule,
    SelectModule,
    DrawerModule,
    TagModule,
    ToastModule,
    TooltipModule,
    ProgressBarModule,
    CurrencyPipe,
    DatePipe,
  ],
  templateUrl: './order-matrix-page.component.html',
  styleUrl: './order-matrix-page.component.scss',
  providers: [MessageService],
})
export class OrderMatrixPageComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly orderApi = inject(OrderApiService);
  private readonly branchApi = inject(BranchApiService);
  private readonly messageService = inject(MessageService);

  private readonly statusIndex = new Map<string, number>(
    ORDER_STATUS_COLUMNS.map((s, i) => [s, i])
  );

  readonly statusLabels = ORDER_STATUS_LABELS;
  readonly statusSeverity = ORDER_STATUS_SEVERITY;
  readonly statusTransitions = ORDER_STATUS_TRANSITIONS;
  readonly terminalStatuses = ORDER_TERMINAL_STATUSES;

  orders = signal<OrderWithHistory[]>([]);
  loading = signal(false);
  totalCount = signal(0);
  selectedDate = signal<Date>(new Date());
  branches = signal<{ id: string; name: string }[]>([]);
  selectedBranch = signal<string | null>(null);

  showAllColumns = signal(true);
  verticalHeaders = signal(false);

  readonly pageSize = 10;
  currentPage = signal(0);
  totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize)));

  drawerVisible = signal(false);
  selectedOrder = signal<OrderWithHistory | null>(null);
  drawerOrder = signal<Order | null>(null);
  drawerLoading = signal(false);

  readonly canChangeStatus = computed(() => this.authStore.hasPermission('order:status:change'));
  readonly canViewAllBranches = computed(() => this.authStore.hasPermission('view:branch:all'));
  readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);

  activeStatuses = computed(() => {
    if (this.showAllColumns()) {
      return ORDER_STATUS_COLUMNS;
    }
    const present = new Set<string>();
    for (const order of this.orders()) {
      present.add(order.status);
      for (const entry of order.history) {
        present.add(entry.toStatus);
      }
    }
    return ORDER_STATUS_COLUMNS.filter((s) => present.has(s));
  });

  cellMatrix = computed(() => {
    const statuses = this.activeStatuses();
    const result = new Map<string, Map<string, CellInfo>>();
    for (const order of this.orders()) {
      const row = new Map<string, CellInfo>();
      const visited = new Set(order.history.map((h) => h.toStatus));
      const reverted = this.getRevertedStatuses(order.history);
      for (const status of statuses) {
        row.set(status, this.buildCellInfo(order, status, visited, reverted));
      }
      result.set(order.id, row);
    }
    return result;
  });

  pages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const range: number[] = [];
    const start = Math.max(0, current - 2);
    const end = Math.min(total, start + 5);
    for (let i = start; i < end; i++) range.push(i);
    return range;
  });

  ngOnInit(): void {
    this.branchApi.listAdmin().subscribe({
      next: (branches) => {
        this.branches.set(branches.map((b) => ({ id: b.id, name: b.storeName })));
      },
      error: () => {},
    });
    this.loadMatrix();
  }

  loadMatrix(): void {
    this.loading.set(true);
    const date = this.selectedDate();
    const dateFrom = this.formatDate(date);
    const nextDay = new Date(date.getTime() + 86400000);
    const dateTo = this.formatDate(nextDay);

    const filter: MatrixFilter = {
      date_from: dateFrom,
      date_to: dateTo,
      limit: this.pageSize,
      offset: this.currentPage() * this.pageSize,
    };

    if (!this.canViewAllBranches() && this.userBranchId()) {
      filter.branch_id = this.userBranchId()!;
    } else if (this.selectedBranch()) {
      filter.branch_id = this.selectedBranch()!;
    }

    this.orderApi.listMatrix(filter).subscribe({
      next: (res) => {
        this.orders.set(res.items);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar las órdenes',
        });
      },
    });
  }

  onDateChange(date: Date): void {
    this.selectedDate.set(date);
    this.currentPage.set(0);
    this.loadMatrix();
  }

  onBranchChange(branchId: string | null): void {
    this.selectedBranch.set(branchId);
    this.currentPage.set(0);
    this.loadMatrix();
  }

  toggleAllColumns(): void {
    this.showAllColumns.update((v) => !v);
  }

  toggleVerticalHeaders(): void {
    this.verticalHeaders.update((v) => !v);
  }

  goToPage(page: number): void {
    this.currentPage.set(page);
    this.loadMatrix();
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages() - 1) {
      this.currentPage.update((p) => p + 1);
      this.loadMatrix();
    }
  }

  prevPage(): void {
    if (this.currentPage() > 0) {
      this.currentPage.update((p) => p - 1);
      this.loadMatrix();
    }
  }

  openDetail(order: OrderWithHistory): void {
    this.selectedOrder.set(order);
    this.drawerOrder.set(null);
    this.drawerVisible.set(true);
    this.drawerLoading.set(true);
    this.orderApi.getById(order.id).subscribe({
      next: (full) => {
        this.drawerOrder.set(full);
        this.drawerLoading.set(false);
      },
      error: () => this.drawerLoading.set(false),
    });
  }

  getBranchName(branchId: string): string {
    return this.branches().find((b) => b.id === branchId)?.name ?? branchId.slice(0, 8);
  }

  onCellClick(order: OrderWithHistory, targetStatus: string): void {
    const allowed = this.statusTransitions[order.status]?.includes(targetStatus);
    if (!allowed) {
      const validTargets = (this.statusTransitions[order.status] ?? [])
        .map((s) => this.statusLabels[s])
        .join(', ');
      this.messageService.add({
        severity: 'warn',
        summary: 'Transición no válida',
        detail: `Desde "${this.statusLabels[order.status]}" solo puede ir a: ${validTargets}`,
      });
      return;
    }

    const originalStatus = order.status;
    const originalHistory = [...order.history];

    const updatedHistory: StatusHistoryEntry[] = [
      ...order.history,
      {
        id: crypto.randomUUID(),
        orderId: order.id,
        fromStatus: originalStatus,
        toStatus: targetStatus,
        changedByUserId: null,
        notes: null,
        createdAtUtc: new Date().toISOString(),
      },
    ];

    this.orders.update((orders) =>
      orders.map((o) => (o.id === order.id ? { ...o, status: targetStatus, history: updatedHistory } : o))
    );

    this.orderApi
      .changeStatus(order.id, { to_status: targetStatus, notes: '' })
      .subscribe({
        next: () => {
          this.orderApi.getHistory(order.id).subscribe((history) => {
            this.orders.update((orders) =>
              orders.map((o) => (o.id === order.id ? { ...o, status: targetStatus, history } : o))
            );
          });
          this.messageService.add({
            severity: 'success',
            summary: 'Estado actualizado',
            detail: `Orden ${order.displayId} → ${this.statusLabels[targetStatus]}`,
          });
        },
        error: () => {
          this.orders.update((orders) =>
            orders.map((o) =>
              o.id === order.id ? { ...o, status: originalStatus, history: originalHistory } : o
            )
          );
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'No se pudo cambiar el estado. Intente de nuevo.',
          });
        },
      });
  }

  isTerminal(status: string): boolean {
    return !!this.terminalStatuses[status];
  }

  onPageInputChange(event: Event, input: HTMLInputElement): void {
    const value = parseInt(input.value, 10);
    if (!isNaN(value) && value >= 1 && value <= this.totalPages()) {
      this.goToPage(value - 1);
    } else {
      input.value = String(this.currentPage() + 1);
    }
  }

  pageLabel(page: number): string {
    return String(page + 1);
  }

  get pageStart(): number {
    return this.currentPage() * this.pageSize + 1;
  }

  get pageEnd(): number {
    return Math.min((this.currentPage() + 1) * this.pageSize, this.totalCount());
  }

  private isBackwardTransition(from: string, to: string): boolean {
    const fromIdx = this.statusIndex.get(from) ?? 0;
    const toIdx = this.statusIndex.get(to) ?? 0;
    return toIdx < fromIdx;
  }

  private getRevertedStatuses(history: StatusHistoryEntry[]): Set<string> {
    const reverted = new Set<string>();
    for (let i = 0; i < history.length - 1; i++) {
      const current = history[i];
      const next = history[i + 1];
      if (this.isBackwardTransition(current.toStatus, next.toStatus)) {
        reverted.add(current.toStatus);
      }
    }
    return reverted;
  }

  private buildCellInfo(
    order: OrderWithHistory,
    statusCode: string,
    visited: Set<string>,
    reverted: Set<string>
  ): CellInfo {
    const current = order.status;
    const isTerminalStatus = !!this.terminalStatuses[statusCode];

    let type: CellType;
    if (statusCode === current && isTerminalStatus) {
      type = 'terminal';
    } else if (statusCode === current) {
      type = 'active';
    } else if (visited.has(statusCode) && reverted.has(statusCode)) {
      type = 'reverted';
    } else if (
      visited.has(statusCode) &&
      this.canChangeStatus() &&
      !this.isTerminal(current) &&
      (this.statusTransitions[current] ?? []).includes(statusCode)
    ) {
      type = 'completed';
    } else if (visited.has(statusCode)) {
      type = 'unreachable';
    } else {
      type = 'pending';
    }

    const clickable =
      this.canChangeStatus() &&
      !this.isTerminal(current) &&
      (this.statusTransitions[current] ?? []).includes(statusCode);

    return { type, clickable };
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
