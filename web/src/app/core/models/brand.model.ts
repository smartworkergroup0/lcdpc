export interface Brand {
  id: string;
  name: string;
  code: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface CreateBrandRequest {
  name: string;
  code: string;
}
