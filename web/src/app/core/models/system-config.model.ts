export interface SystemConfig {
  id: string;
  logoPath: string | null;
  iconPath: string | null;
  pageName: string;
  title: string;
  showPriceInCatalog: boolean;
  negativeStock: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSystemConfigRequest {
  logo_path?: string | null;
  icon_path?: string | null;
  page_name: string;
  title: string;
  show_price_in_catalog: boolean;
  negative_stock: boolean;
  active: boolean;
}

export interface UpdateSystemConfigRequest {
  logo_path?: string | null;
  icon_path?: string | null;
  page_name?: string;
  title?: string;
  show_price_in_catalog?: boolean;
  negative_stock?: boolean;
  active?: boolean;
}
