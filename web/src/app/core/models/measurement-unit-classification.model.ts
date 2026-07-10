export interface MeasurementUnitClassification {
  id: string;
  name: string;
  code: string;
}

export interface CreateMeasurementUnitClassificationRequest {
  name: string;
  code: string;
}
