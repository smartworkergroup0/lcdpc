import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, catchError } from 'rxjs';
import { ChartModule } from 'primeng/chart';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TableModule } from 'primeng/table';
import { DashboardApiService } from '../../../core/services/dashboard-api.service';
import { BranchApiService } from '../../../core/services/branch-api.service';
import { AuthStore } from '../../../core/auth/auth.store';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_SEVERITY,
} from '../../../core/models/order.model';

@Component({
  selector: 'app-operations-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartModule, SelectModule, TagModule, TableModule],
  templateUrl: './operations-panel.component.html',
  styleUrl: './operations-panel.component.scss',
})
export class OperationsPanelComponent implements OnInit {
  private readonly dashboardApi = inject(DashboardApiService);
  private readonly branchApi = inject(BranchApiService);
  private readonly authStore = inject(AuthStore);

  protected readonly branchFilter = signal<string | null>(null);
  protected readonly branchOptions = signal<{ label: string; value: string }[]>([]);
  protected readonly loading = signal(true);

  protected readonly todayActivity = signal<{ ordersCreatedToday: number; ordersCompletedToday: number; pendingOrders: number; revenueToday: number } | null>(null);
  protected readonly ordersAttention = signal<{ status: string; count: number }[]>([]);
  protected readonly recentOrders = signal<{ displayId: string; status: string; priceTotal: number; totalItems: number; createdAt: string; customerName: string }[]>([]);

  protected readonly canViewAllBranches = computed(() =>
    this.authStore.hasPermission('view:branch:all')
  );
  protected readonly userBranchId = computed(() =>
    this.authStore.currentUser()?.branchId ?? null
  );

  protected readonly doughnutChartData = computed(() => {
    const data = this.ordersAttention();
    const labels = data.map((d) => ORDER_STATUS_LABELS[d.status] ?? d.status);
    const values = data.map((d) => d.count);
    const bgColors = data.map((d) => {
      const sev = ORDER_STATUS_SEVERITY[d.status] ?? 'info';
      const map: Record<string, string> = {
        warn: '#f59e0b',
        info: '#3b82f6',
        success: '#22c55e',
        danger: '#ef4444',
        secondary: '#9ca3af',
      };
      return map[sev] ?? '#6b7280';
    });
    return { labels, datasets: [{ data: values, backgroundColor: bgColors }] };
  });

  protected readonly doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right' as const },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ` ${ctx.label}: ${ctx.parsed} ordenes`,
        },
      },
    },
  };

  ngOnInit(): void {
    this.loadBranches();
  }

  private loadBranches(): void {
    this.branchApi.listAdmin().subscribe({
      next: (branches) => {
        this.branchOptions.set(
          branches.map((b) => ({
            label: b.storeName,
            value: b.id,
          }))
        );
        if (branches.length > 0 && !this.branchFilter()) {
          this.branchFilter.set(branches[0].id);
        }
        this.loadAll();
      },
    });
  }

  protected loadAll(): void {
    this.loading.set(true);
    const branchId = this.canViewAllBranches()
      ? (this.branchFilter() ?? undefined)
      : (this.userBranchId() ?? undefined);

    forkJoin({
      todayActivity: this.dashboardApi.getTodayActivityOperations(branchId).pipe(catchError(() => of(null))),
      ordersAttention: this.dashboardApi.getOrdersAttention(branchId).pipe(catchError(() => of([]))),
      recentOrders: this.dashboardApi.getRecentOrders(branchId).pipe(catchError(() => of([]))),
    }).subscribe({
      next: (data) => {
        this.todayActivity.set(data.todayActivity);
        this.ordersAttention.set(data.ordersAttention);
        this.recentOrders.set(data.recentOrders);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  protected onBranchChange(): void {
    this.loadAll();
  }

  protected getStatusLabel(status: string): string {
    return ORDER_STATUS_LABELS[status] ?? status;
  }

  protected getStatusSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    return ORDER_STATUS_SEVERITY[status] ?? 'info';
  }

  protected formatCurrency(val: number): string {
    return `$${val.toFixed(2)}`;
  }
}
