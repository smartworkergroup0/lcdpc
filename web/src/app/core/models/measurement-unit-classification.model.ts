export interface MeasurementUnitClassification {
  id: string;
  name: string;
  code: string;
  canDecimalStock: boolean;
}

export interface CreateMeasurementUnitClassificationRequest {
  name: string;
  code: string;
  canDecimalStock: boolean;
}
