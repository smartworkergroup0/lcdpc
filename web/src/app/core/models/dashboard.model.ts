export interface OrdersByStatusItem {
  status: string;
  count: number;
  totalRevenue: number;
}

export interface SalesTrendItem {
  date: string;
  count: number;
  revenue: number;
}

export interface TopItem {
  id: string;
  name: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface LowStockItem {
  productId: string;
  name: string;
  sku: string;
  stockAvailable: number;
  stock: number;
  branchId: string;
  baseUnitId: string | null;
}

export interface SummaryData {
  totalProducts: number;
  totalBundles: number;
  totalOrders: number;
  pendingOrders: number;
}

export interface StockHealth {
  outOfStock: number;
  lowStock: number;
  healthy: number;
  items: LowStockItem[];
}
