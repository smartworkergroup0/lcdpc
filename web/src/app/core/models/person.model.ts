export interface Person {
  id: string;
  name: string;
  identityDocument: string;
  taxId: string | null;
  whatsappPhone: string;
  fullAddress: string;
  isClient: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface UpsertPersonRequest {
  name: string;
  identityDocument: string;
  taxId: string | null;
  whatsappPhone: string;
  fullAddress: string;
}
