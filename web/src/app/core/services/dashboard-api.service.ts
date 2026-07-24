import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import {
  OrdersByStatusItem,
  SalesTrendItem,
  TopItem,
  StockHealth,
  SummaryData,
} from '../models/dashboard.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface OrdersByStatusGoData {
  status: string;
  count: number;
  total_revenue: number;
}

interface SalesTrendGoData {
  date: string;
  count: number;
  revenue: number;
}

interface TopItemGoData {
  id: string;
  name: string;
  total_quantity: number;
  total_revenue: number;
}

interface LowStockItemGoData {
  product_id: string;
  name: string;
  sku: string;
  stock_available: number;
  stock: number;
  branch_id: string;
  base_unit_id: string | null;
}

interface StockHealthGoData {
  out_of_stock: number;
  low_stock: number;
  healthy: number;
  items: LowStockItemGoData[];
}

interface SummaryGoData {
  total_products: number;
  total_bundles: number;
  total_orders: number;
  pending_orders: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  getSummary(branchId?: string): Observable<SummaryData> {
    const params: Record<string, string> = {};
    if (branchId) params['branch_id'] = branchId;
    return this.http
      .get<JsendEnvelope<SummaryGoData>>(`${this.baseUrl}/api/v1/dashboard/summary`, {
        params,
      })
      .pipe(
        map((res) => ({
          totalProducts: res.data?.total_products ?? 0,
          totalBundles: res.data?.total_bundles ?? 0,
          totalOrders: res.data?.total_orders ?? 0,
          pendingOrders: res.data?.pending_orders ?? 0,
        }))
      );
  }

  getOrdersByStatus(branchId?: string): Observable<OrdersByStatusItem[]> {
    const params: Record<string, string> = {};
    if (branchId) params['branch_id'] = branchId;
    return this.http
      .get<JsendEnvelope<OrdersByStatusGoData[]>>(`${this.baseUrl}/api/v1/dashboard/orders-by-status`, {
        params,
      })
      .pipe(
        map((res) =>
          (res.data ?? []).map((d) => ({
            status: d.status,
            count: d.count,
            totalRevenue: d.total_revenue,
          }))
        )
      );
  }

  getSalesTrend(days = 30, branchId?: string): Observable<SalesTrendItem[]> {
    const params: Record<string, string> = { days: String(days) };
    if (branchId) params['branch_id'] = branchId;
    return this.http
      .get<JsendEnvelope<SalesTrendGoData[]>>(`${this.baseUrl}/api/v1/dashboard/sales-trend`, {
        params,
      })
      .pipe(
        map((res) =>
          (res.data ?? []).map((d) => ({
            date: d.date,
            count: d.count,
            revenue: d.revenue,
          }))
        )
      );
  }

  getTopProducts(days = 30, limit = 10, branchId?: string): Observable<TopItem[]> {
    const params: Record<string, string> = { days: String(days), limit: String(limit) };
    if (branchId) params['branch_id'] = branchId;
    return this.http
      .get<JsendEnvelope<TopItemGoData[]>>(`${this.baseUrl}/api/v1/dashboard/top-products`, {
        params,
      })
      .pipe(
        map((res) =>
          (res.data ?? []).map((d) => ({
            id: d.id,
            name: d.name,
            totalQuantity: d.total_quantity,
            totalRevenue: d.total_revenue,
          }))
        )
      );
  }

  getTopBundles(days = 30, limit = 10, branchId?: string): Observable<TopItem[]> {
    const params: Record<string, string> = { days: String(days), limit: String(limit) };
    if (branchId) params['branch_id'] = branchId;
    return this.http
      .get<JsendEnvelope<TopItemGoData[]>>(`${this.baseUrl}/api/v1/dashboard/top-bundles`, {
        params,
      })
      .pipe(
        map((res) =>
          (res.data ?? []).map((d) => ({
            id: d.id,
            name: d.name,
            totalQuantity: d.total_quantity,
            totalRevenue: d.total_revenue,
          }))
        )
      );
  }

  getStockHealth(branchId?: string): Observable<StockHealth> {
    const params: Record<string, string> = {};
    if (branchId) params['branch_id'] = branchId;
    return this.http
      .get<JsendEnvelope<StockHealthGoData>>(`${this.baseUrl}/api/v1/dashboard/stock-health`, {
        params,
      })
      .pipe(
        map((res) => ({
          outOfStock: res.data?.out_of_stock ?? 0,
          lowStock: res.data?.low_stock ?? 0,
          healthy: res.data?.healthy ?? 0,
          items: (res.data?.items ?? []).map((d) => ({
            productId: d.product_id,
            name: d.name,
            sku: d.sku,
            stockAvailable: d.stock_available,
            stock: d.stock,
            branchId: d.branch_id,
            baseUnitId: d.base_unit_id,
          })),
        }))
      );
  }

  // Operations panel methods
  getOrdersByStatusOperations(branchId?: string): Observable<OrdersByStatusItem[]> {
    const params: Record<string, string> = {};
    if (branchId) params['branch_id'] = branchId;
    return this.http
      .get<JsendEnvelope<OrdersByStatusGoData[]>>(`${this.baseUrl}/api/v1/dashboard/operations/orders-by-status`, {
        params,
      })
      .pipe(
        map((res) =>
          (res.data ?? []).map((d) => ({
            status: d.status,
            count: d.count,
            totalRevenue: d.total_revenue,
          }))
        )
      );
  }

  getTodayActivityOperations(branchId?: string): Observable<{ ordersCreatedToday: number; ordersCompletedToday: number; pendingOrders: number; revenueToday: number }> {
    const params: Record<string, string> = {};
    if (branchId) params['branch_id'] = branchId;
    return this.http
      .get<JsendEnvelope<{ orders_created_today: number; orders_completed_today: number; pending_orders: number; revenue_today: number }>>(`${this.baseUrl}/api/v1/dashboard/operations/today-activity`, {
        params,
      })
      .pipe(
        map((res) => ({
          ordersCreatedToday: res.data?.orders_created_today ?? 0,
          ordersCompletedToday: res.data?.orders_completed_today ?? 0,
          pendingOrders: res.data?.pending_orders ?? 0,
          revenueToday: res.data?.revenue_today ?? 0,
        }))
      );
  }

  getTodayActivityAdmin(branchId?: string): Observable<{ ordersCreatedToday: number; ordersCompletedToday: number; pendingOrders: number; revenueToday: number }> {
    const params: Record<string, string> = {};
    if (branchId) params['branch_id'] = branchId;
    return this.http
      .get<JsendEnvelope<{ orders_created_today: number; orders_completed_today: number; pending_orders: number; revenue_today: number }>>(`${this.baseUrl}/api/v1/dashboard/today-activity`, {
        params,
      })
      .pipe(
        map((res) => ({
          ordersCreatedToday: res.data?.orders_created_today ?? 0,
          ordersCompletedToday: res.data?.orders_completed_today ?? 0,
          pendingOrders: res.data?.pending_orders ?? 0,
          revenueToday: res.data?.revenue_today ?? 0,
        }))
      );
  }

  getOrdersAttention(branchId?: string): Observable<{ status: string; count: number }[]> {
    const params: Record<string, string> = {};
    if (branchId) params['branch_id'] = branchId;
    return this.http
      .get<JsendEnvelope<{ status: string; count: number }[]>>(`${this.baseUrl}/api/v1/dashboard/operations/orders-attention`, {
        params,
      })
      .pipe(
        map((res) => res.data ?? [])
      );
  }

  getRecentOrders(branchId?: string): Observable<{ displayId: string; status: string; priceTotal: number; totalItems: number; createdAt: string; customerName: string }[]> {
    const params: Record<string, string> = {};
    if (branchId) params['branch_id'] = branchId;
    return this.http
      .get<JsendEnvelope<{ display_id: string; status: string; price_total: number; total_items: number; created_at: string; customer_name: string }[]>>(`${this.baseUrl}/api/v1/dashboard/operations/recent-orders`, {
        params,
      })
      .pipe(
        map((res) =>
          (res.data ?? []).map((d) => ({
            displayId: d.display_id,
            status: d.status,
            priceTotal: d.price_total,
            totalItems: d.total_items,
            createdAt: d.created_at,
            customerName: d.customer_name,
          }))
        )
      );
  }
}
