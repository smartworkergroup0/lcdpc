export interface Order {
  id: string;
  displayId: string;
  branchId: string;
  personId: string | null;
  clientUserId: string | null;
  status: string;
  priceTotal: number;
  totalItems: number;
  currency: string;
  notes: string | null;
  deletedAt: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  itemType: string;
  productId: string | null;
  bundleId: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  currency: string;
}

export interface CreateOrderRequest {
  branch_id: string;
  person_id?: string;
  client_user_id?: string;
  person_name?: string;
  person_identity_document?: string;
  person_tax_id?: string | null;
  person_whatsapp_phone?: string;
  person_full_address?: string;
  notes: string;
  items: CreateOrderItem[];
}

export interface CreateOrderItem {
  item_type: string;
  product_id?: string;
  bundle_id?: string;
  quantity: number;
  unit_price: number;
}

export interface UpdateOrderRequest {
  notes: string;
  items: CreateOrderItem[];
}

export interface StatusChangeRequest {
  to_status: string;
  notes: string;
}

export interface StatusOption {
  code: string;
  label: string;
  color: string;
}

export interface ValidTransitionsResponse {
  current_status: string;
  is_terminal: boolean;
  statuses: StatusOption[];
}

export interface StatusHistoryEntry {
  id: string;
  orderId: string;
  fromStatus: string | null;
  toStatus: string;
  changedByUserId: string | null;
  notes: string | null;
  createdAtUtc: string;
}

export interface OrderFilter {
  branch_id?: string;
  client_user_id?: string;
  person_id?: string;
  status?: string;
  display_id?: string;
  limit?: number;
  offset?: number;
}

export interface OrderWithHistory extends Order {
  history: StatusHistoryEntry[];
}

export interface MatrixFilter {
  branch_id?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'Pendiente de revisión',
  UNDER_REVIEW: 'En revisión',
  APPROVED_FOR_FULFILLMENT: 'Aprobado para preparación',
  REJECTED_BY_VALIDATION: 'Rechazado',
  IN_PREPARATION: 'En preparación',
  AWAITING_INVENTORY: 'Esperando inventario',
  PREPARATION_COMPLETED: 'Preparación completada',
  READY_FOR_PICKUP: 'Listo para recoger',
  READY_FOR_DISPATCH: 'Listo para despacho',
  IN_TRANSIT: 'En tránsito',
  DELIVERED: 'Entregado',
  PICKED_UP: 'Recogido',
  DELIVERY_FAILED: 'Falló la entrega',
  COMPLETED: 'Completado',
  CANCELLED_BY_CUSTOMER: 'Cancelado por el cliente',
};

export const ORDER_STATUS_SEVERITY: Record<string, 'warn' | 'info' | 'success' | 'danger' | 'secondary'> = {
  PENDING_REVIEW: 'warn',
  UNDER_REVIEW: 'warn',
  APPROVED_FOR_FULFILLMENT: 'info',
  REJECTED_BY_VALIDATION: 'danger',
  IN_PREPARATION: 'info',
  AWAITING_INVENTORY: 'warn',
  PREPARATION_COMPLETED: 'info',
  READY_FOR_PICKUP: 'success',
  READY_FOR_DISPATCH: 'success',
  IN_TRANSIT: 'info',
  DELIVERED: 'success',
  PICKED_UP: 'success',
  DELIVERY_FAILED: 'danger',
  COMPLETED: 'success',
  CANCELLED_BY_CUSTOMER: 'secondary',
};

export const ORDER_TERMINAL_STATUSES: Record<string, boolean> = {
  REJECTED_BY_VALIDATION: true,
  DELIVERY_FAILED: true,
  COMPLETED: true,
  CANCELLED_BY_CUSTOMER: true,
};

export const ORDER_EDITABLE_STATUSES: Record<string, boolean> = {
  PENDING_REVIEW: true,
  UNDER_REVIEW: true,
};

export const ORDER_STATUS_COLUMNS: string[] = [
  'PENDING_REVIEW',
  'UNDER_REVIEW',
  'APPROVED_FOR_FULFILLMENT',
  'IN_PREPARATION',
  'AWAITING_INVENTORY',
  'PREPARATION_COMPLETED',
  'READY_FOR_PICKUP',
  'READY_FOR_DISPATCH',
  'IN_TRANSIT',
  'DELIVERED',
  'PICKED_UP',
  'REJECTED_BY_VALIDATION',
  'DELIVERY_FAILED',
  'COMPLETED',
  'CANCELLED_BY_CUSTOMER',
];
