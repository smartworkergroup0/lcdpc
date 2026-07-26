import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
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
  ORDER_STATUS_LABELS,
  ORDER_STATUS_SEVERITY,
  OrderWithHistory,
  StatusHistoryEntry,
} from '../../../core/models/order.model';
import { WorkflowNodeData, WorkflowEdge } from '../../../core/models/workflow.model';
import { OrderApiService } from '../../../core/services/order-api.service';
import { BranchApiService } from '../../../core/services/branch-api.service';
import { WorkflowApiService } from '../../../core/services/workflow-api.service';
import { ProductApiService } from '../../../core/services/product-api.service';
import { BundleApiService } from '../../../core/services/bundle-api.service';

type CellType = 'terminal' | 'current' | 'visited' | 'reverted' | 'pending';

interface CellInfo {
  type: CellType;
  clickable: boolean;
}

interface WorkflowNodeEntry {
  code: string;
  label: string;
  isFinal: boolean;
  isInitial: boolean;
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
export class OrderMatrixPageComponent implements OnInit, OnDestroy {
  private readonly authStore = inject(AuthStore);
  private readonly orderApi = inject(OrderApiService);
  private readonly branchApi = inject(BranchApiService);
  private readonly workflowApi = inject(WorkflowApiService);
  private readonly productApi = inject(ProductApiService);
  private readonly bundleApi = inject(BundleApiService);
  private readonly messageService = inject(MessageService);

  readonly statusLabels = ORDER_STATUS_LABELS;
  readonly statusSeverity = ORDER_STATUS_SEVERITY;

  workflowLoaded = signal(false);
  workflowNodes = signal<WorkflowNodeEntry[]>([]);
  workflowFinalCodes = signal<Set<string>>(new Set());

  private workflowEdges = new Map<string, Set<string>>();
  private workflowIncoming = new Map<string, Set<string>>();

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

  private productNames = signal<Map<string, string>>(new Map());
  private bundleNames = signal<Map<string, string>>(new Map());

  protected readonly refreshInterval = signal<number | null>(60000);
  protected readonly intervalOptions = [
    { label: '30s', value: 30000 },
    { label: '1m', value: 60000 },
    { label: '2m', value: 120000 },
    { label: '5m', value: 300000 },
    { label: '10m', value: 600000 },
  ];
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  readonly canChangeStatus = computed(() => this.authStore.hasPermission('order:status:change'));
  readonly canViewAllBranches = computed(() => this.authStore.hasPermission('view:branch:all'));
  readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);

  activeStatuses = computed(() => {
    const nodes = this.workflowNodes();
    if (this.showAllColumns()) {
      return nodes;
    }
    const present = new Set<string>();
    for (const order of this.orders()) {
      present.add(order.status);
      for (const entry of order.history) {
        present.add(entry.toStatus);
      }
    }
    return nodes.filter((n) => present.has(n.code));
  });

  cellMatrix = computed(() => {
    const statuses = this.activeStatuses();
    const result = new Map<string, Map<string, CellInfo>>();
    for (const order of this.orders()) {
      const row = new Map<string, CellInfo>();
      const visited = new Set(order.history.map((h) => h.toStatus));
      const reverted = this.getRevertedStatuses(order.history);
      const validTargets = this.getValidTargets(order.status);
      for (const node of statuses) {
        row.set(node.code, this.buildCellInfo(order, node, visited, reverted, validTargets));
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
    this.loadWorkflow();
    this.loadMatrix();
  }

  constructor() {
    effect(() => {
      const ms = this.refreshInterval();
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
      }
      if (ms !== null) {
        this.refreshTimer = setInterval(() => this.loadMatrix(), ms);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }

  private loadWorkflow(): void {
    this.workflowApi.list({ entity_type: 'order', is_active: true }).subscribe({
      next: (res) => {
        const workflow = res.items[0];
        if (!workflow) {
          this.workflowLoaded.set(true);
          this.workflowNodes.set([]);
          this.workflowFinalCodes.set(new Set());
          return;
        }

        const nodes: WorkflowNodeEntry[] = workflow.nodes.map((n) => ({
          code: n.data.code,
          label: n.data.label || ORDER_STATUS_LABELS[n.data.code] || n.data.code,
          isFinal: n.data.isFinal,
          isInitial: n.data.isInitial,
        }));

        const finalCodes = new Set(nodes.filter((n) => n.isFinal).map((n) => n.code));

        const edges = new Map<string, Set<string>>();
        const incoming = new Map<string, Set<string>>();
        const nodeIdToCode = new Map<string, string>();
        for (const node of workflow.nodes) {
          nodeIdToCode.set(node.id, node.data.code);
        }
        for (const edge of workflow.edges) {
          const srcCode = nodeIdToCode.get(edge.source);
          const tgtCode = nodeIdToCode.get(edge.target);
          if (!srcCode || !tgtCode) continue;
          if (!edges.has(srcCode)) edges.set(srcCode, new Set());
          edges.get(srcCode)!.add(tgtCode);
          if (!incoming.has(tgtCode)) incoming.set(tgtCode, new Set());
          incoming.get(tgtCode)!.add(srcCode);
        }

        this.workflowNodes.set(nodes);
        this.workflowFinalCodes.set(finalCodes);
        this.workflowEdges = edges;
        this.workflowIncoming = incoming;
        this.workflowLoaded.set(true);
      },
      error: () => {
        this.workflowLoaded.set(true);
        this.workflowNodes.set([]);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo cargar el workflow',
        });
      },
    });
  }

  loadMatrix(): void {
    this.loading.set(true);
    const date = this.selectedDate();
    const utcMidnight = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dateFrom = this.formatDate(utcMidnight);
    const nextDay = new Date(utcMidnight.getTime() + 86400000);
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

    forkJoin({
      full: this.orderApi.getById(order.id),
      products: this.productApi.list({ limit: 1000, offset: 0 }),
      bundles: this.bundleApi.list({ limit: 1000, offset: 0 }),
    }).subscribe({
      next: ({ full, products, bundles }) => {
        this.productNames.set(new Map(products.items.map((p) => [p.productId, p.name])));
        this.bundleNames.set(new Map(bundles.items.map((b) => [b.bundleId, b.name])));
        this.drawerOrder.set(full);
        this.drawerLoading.set(false);
      },
      error: () => this.drawerLoading.set(false),
    });
  }

  getBranchName(branchId: string): string {
    return this.branches().find((b) => b.id === branchId)?.name ?? branchId.slice(0, 8);
  }

  getItemName(item: { itemType: string; productId: string | null; bundleId: string | null }): string {
    if (item.itemType === 'bundle') {
      return this.bundleNames().get(item.bundleId ?? '') ?? (item.bundleId?.slice(0, 8) ?? '');
    }
    return this.productNames().get(item.productId ?? '') ?? (item.productId?.slice(0, 8) ?? '');
  }

  onCellClick(order: OrderWithHistory, targetStatus: string): void {
    if (targetStatus === order.status) return;

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
        changedByName: null,
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
            detail: `Orden ${order.displayId} → ${this.getNodeLabel(targetStatus)}`,
          });
        },
        error: (err) => {
          this.orders.update((orders) =>
            orders.map((o) =>
              o.id === order.id ? { ...o, status: originalStatus, history: originalHistory } : o
            )
          );
          const rawMsg = err?.error?.message ?? '';
          let msg: string;
          if (rawMsg.startsWith('INVALID_TRANSITION:')) {
            msg = rawMsg.replace('INVALID_TRANSITION:', '').trim();
          } else if (rawMsg === 'INVALID_TRANSITION') {
            msg = `Transición no válida desde "${this.getNodeLabel(originalStatus)}"`;
          } else {
            msg = 'No se pudo cambiar el estado. Intente de nuevo.';
          }
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: msg,
          });
        },
      });
  }

  getNodeLabel(code: string): string {
    const node = this.workflowNodes().find((n) => n.code === code);
    return node?.label || ORDER_STATUS_LABELS[code] || code;
  }

  isTerminalStatus(code: string): boolean {
    return this.workflowFinalCodes().has(code);
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

  private getValidTargets(currentStatus: string): Set<string> {
    return this.workflowEdges.get(currentStatus) ?? new Set();
  }

  private getRevertedStatuses(history: StatusHistoryEntry[]): Set<string> {
    const reverted = new Set<string>();
    const activeAtStep: string[] = [];

    for (const entry of history) {
      const status = entry.toStatus;

      if (activeAtStep.length >= 2) {
        const prev = activeAtStep[activeAtStep.length - 2];
        if (status === prev) {
          const popped = activeAtStep.pop()!;
          reverted.add(popped);
          continue;
        }
      }

      if (this.workflowIncoming.has(status)) {
        const expectedSources = this.workflowIncoming.get(status)!;
        if (activeAtStep.length > 0) {
          const current = activeAtStep[activeAtStep.length - 1];
          if (!expectedSources.has(current) && current !== status) {
            reverted.add(current);
            activeAtStep.pop();
          }
        }
      }

      activeAtStep.push(status);
    }

    return reverted;
  }

  private buildCellInfo(
    order: OrderWithHistory,
    node: WorkflowNodeEntry,
    visited: Set<string>,
    reverted: Set<string>,
    validTargets: Set<string>
  ): CellInfo {
    const current = order.status;
    const isFinal = node.isFinal;

    let type: CellType;
    if (node.code === current && isFinal) {
      type = 'terminal';
    } else if (node.code === current) {
      type = 'current';
    } else if (visited.has(node.code) && reverted.has(node.code)) {
      type = 'reverted';
    } else if (visited.has(node.code)) {
      type = 'visited';
    } else {
      type = 'pending';
    }

    const isCurrentTerminal = this.workflowFinalCodes().has(current);
    const clickable =
      this.canChangeStatus() &&
      !isCurrentTerminal &&
      node.code !== current &&
      validTargets.has(node.code);

    return { type, clickable };
  }

  private formatDate(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
