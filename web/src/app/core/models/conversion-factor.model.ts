export interface ConversionFactor {
  id: string;
  productId: string;
  fromUnitId: string;
  toUnitId: string;
  amount: number;
  main: boolean;
}

export interface CreateConversionFactorRequest {
  product_id: string;
  from_unit_id: string;
  to_unit_id: string;
  amount: number;
  main?: boolean;
}
