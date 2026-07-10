export interface ProductBranchPrice {
  id: string;
  productId: string;
  priceCategoryId: string | null;
  amount: number;
  currency: string;
}

export interface CreatePriceRequest {
  product_id: string;
  price_category_id?: string | null;
  amount: number;
}
