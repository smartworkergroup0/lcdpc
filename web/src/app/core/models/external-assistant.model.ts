export interface AssistantLead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  status: string;
  score: number;
  userIdentification: string;
  address: string;
  isProcessed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantOrder {
  id: string;
  customerName: string;
  identification: string;
  address: string;
  summary: string;
  isRetentionAgent: boolean;
  status: string;
  referenceNumber: string | null;
  referenceDate: string | null;
  isProcessed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantListFilter {
  limit?: number;
  offset?: number;
  search?: string;
  status?: string;
  is_processed?: boolean;
}

export const ASSISTANT_LEAD_STATUS_LABELS: Record<string, string> = {
  nuevo: 'Nuevo',
  en_conversacion: 'En Conversacion',
  calificado: 'Calificado',
  cliente: 'Cliente',
  descartado: 'Descartado',
  bloqueado: 'Bloqueado',
  vendido: 'Vendido',
};

export const ASSISTANT_ORDER_STATUS_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  PROCESADO: 'Procesado',
  CANCELADO: 'Cancelado',
};

export const ASSISTANT_LEAD_STATUS_OPTIONS = Object.entries(ASSISTANT_LEAD_STATUS_LABELS).map(
  ([value, label]) => ({ label, value })
);

export const ASSISTANT_ORDER_STATUS_OPTIONS = Object.entries(ASSISTANT_ORDER_STATUS_LABELS).map(
  ([value, label]) => ({ label, value })
);
