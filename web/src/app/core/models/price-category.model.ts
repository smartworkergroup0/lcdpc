export interface PriceCategory {
  id: string;
  name: string;
  code: string;
}

export interface CreatePriceCategoryRequest {
  name: string;
  code: string;
}
