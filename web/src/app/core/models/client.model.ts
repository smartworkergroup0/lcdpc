export interface Client {
  id: string;
  name: string;
  identityDocument: string;
  taxId: string | null;
  whatsappPhone: string;
  fullAddress: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface CreateClientRequest {
  name: string;
  identity_document: string;
  tax_id?: string;
  whatsapp_phone: string;
  full_address: string;
}

export interface UpdateClientRequest {
  name?: string;
  identity_document?: string;
  tax_id?: string;
  whatsapp_phone?: string;
  full_address?: string;
}

export interface ClientListFilter {
  limit?: number;
  offset?: number;
  search?: string;
}
