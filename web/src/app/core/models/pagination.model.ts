export interface PaginatedResponse<T> {
  items: T[];
  totalCount: number;
  limit: number;
  offset: number;
}

export interface ProductListFilter {
  limit?: number;
  offset?: number;
  category_id?: string;
  name?: string;
  sku?: string;
  branch_id?: string;
  is_active?: boolean;
}

export interface BundleListFilter {
  limit?: number;
  offset?: number;
  category_id?: string;
  name?: string;
  code?: string;
  status?: string;
  branch_id?: string;
}
