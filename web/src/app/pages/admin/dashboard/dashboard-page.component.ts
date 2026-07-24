import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, catchError } from 'rxjs';
import { ChartModule } from 'primeng/chart';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { DashboardApiService } from '../../../core/services/dashboard-api.service';
import { BranchApiService } from '../../../core/services/branch-api.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { MeasurementUnitStore } from '../../../core/stores/measurement-unit.store';
import {
  OrdersByStatusItem,
  SalesTrendItem,
  TopItem,
  StockHealth,
  SummaryData,
} from '../../../core/models/dashboard.model';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_SEVERITY,
} from '../../../core/models/order.model';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartModule, SelectModule, TooltipModule],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent implements OnInit {
  private readonly dashboardApi = inject(DashboardApiService);
  private readonly branchApi = inject(BranchApiService);
  private readonly authStore = inject(AuthStore);
  private readonly unitStore = inject(MeasurementUnitStore);

  protected readonly branchFilter = signal<string | null>(null);
  protected readonly branchOptions = signal<{ label: string; value: string }[]>([]);
  protected readonly loading = signal(true);

  protected readonly ordersByStatus = signal<OrdersByStatusItem[]>([]);
  protected readonly salesTrend = signal<SalesTrendItem[]>([]);
  protected readonly topProducts = signal<TopItem[]>([]);
  protected readonly topBundles = signal<TopItem[]>([]);
  protected readonly stockHealth = signal<StockHealth | null>(null);
  protected readonly summary = signal<SummaryData | null>(null);

  protected readonly canViewAllBranches = computed(() =>
    this.authStore.hasPermission('view:branch:all')
  );
  protected readonly userBranchId = computed(() =>
    this.authStore.currentUser()?.branchId ?? null
  );

  protected readonly ordersByStatusChartData = computed(() => {
    const data = this.ordersByStatus();
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

  protected readonly salesTrendChartData = computed(() => {
    const data = this.salesTrend();
    const labels = data.map((d) => {
      const parts = d.date.split('-');
      return `${parts[2]}/${parts[1]}`;
    });
    return {
      labels,
      datasets: [
        {
          label: 'Revenue',
          data: data.map((d) => d.revenue),
          fill: true,
          borderColor: '#f7931a',
          backgroundColor: 'rgba(247, 147, 26, 0.1)',
          tension: 0.4,
        },
        {
          label: 'Ordenes',
          data: data.map((d) => d.count),
          fill: false,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4,
          yAxisID: 'y1',
        },
      ],
    };
  });

  protected readonly topProductsChartData = computed(() => {
    const data = this.topProducts();
    const labels = data.map((d) => d.name.length > 20 ? d.name.slice(0, 20) + '...' : d.name);
    return {
      labels,
      datasets: [
        {
          label: 'Unidades vendidas',
          data: data.map((d) => d.totalQuantity),
          backgroundColor: '#f7931a',
        },
      ],
    };
  });

  protected readonly topBundlesChartData = computed(() => {
    const data = this.topBundles();
    const labels = data.map((d) => d.name.length > 20 ? d.name.slice(0, 20) + '...' : d.name);
    return {
      labels,
      datasets: [
        {
          label: 'Unidades vendidas',
          data: data.map((d) => d.totalQuantity),
          backgroundColor: '#f5cb00',
        },
      ],
    };
  });

  protected readonly stockHealthChartData = computed(() => {
    const health = this.stockHealth();
    if (!health) return { labels: [], datasets: [{ data: [] }] };
    return {
      labels: ['Sin stock', 'Bajo stock', 'Saludable'],
      datasets: [
        {
          data: [health.outOfStock, health.lowStock, health.healthy],
          backgroundColor: ['#ef4444', '#f59e0b', '#22c55e'],
        },
      ],
    };
  });

  protected readonly lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            const val = ctx.parsed.y;
            if (ctx.dataset.label === 'Revenue') return ` $${val.toFixed(2)}`;
            return ` ${val} ordenes`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Revenue ($)' },
      },
      y1: {
        position: 'right' as const,
        beginAtZero: true,
        title: { display: true, text: 'Ordenes' },
        grid: { drawOnChartArea: false },
      },
    },
  };

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

  protected readonly barOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: { beginAtZero: true },
    },
  };

  protected readonly polarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right' as const },
    },
  };

  ngOnInit(): void {
    this.unitStore.load();
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

  protected getUnitSymbol(baseUnitId: string | null | undefined): string {
    return this.unitStore.getMeasurementUnitSymbol(baseUnitId);
  }

  protected loadAll(): void {
    this.loading.set(true);
    const branchId = this.canViewAllBranches()
      ? (this.branchFilter() ?? undefined)
      : (this.userBranchId() ?? undefined);

    const fallback = (val: any) => of(val);

    forkJoin({
      summary: this.dashboardApi.getSummary(branchId).pipe(catchError(() => of(null))),
      ordersByStatus: this.dashboardApi.getOrdersByStatus(branchId).pipe(catchError(() => of([]))),
      salesTrend: this.dashboardApi.getSalesTrend(30, branchId).pipe(catchError(() => of([]))),
      topProducts: this.dashboardApi.getTopProducts(30, 10, branchId).pipe(catchError(() => of([]))),
      topBundles: this.dashboardApi.getTopBundles(30, 10, branchId).pipe(catchError(() => of([]))),
      stockHealth: this.dashboardApi.getStockHealth(branchId).pipe(catchError(() => of(null))),
    }).subscribe({
      next: (data) => {
        this.summary.set(data.summary);
        this.ordersByStatus.set(data.ordersByStatus);
        this.salesTrend.set(data.salesTrend);
        this.topProducts.set(data.topProducts);
        this.topBundles.set(data.topBundles);
        this.stockHealth.set(data.stockHealth);
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

  protected formatCurrency(val: number): string {
    return `$${val.toFixed(2)}`;
  }
}
