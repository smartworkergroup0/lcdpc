export interface MeasurementUnit {
  id: string;
  name: string;
  code: string;
  symbol: string | null;
  classificationId: string | null;
}

export interface CreateMeasurementUnitRequest {
  name: string;
  code: string;
  symbol?: string | null;
  classification_id?: string | null;
}
