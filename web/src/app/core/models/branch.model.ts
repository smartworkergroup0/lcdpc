export interface BranchSchedule {
  id: string;
  branchId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface CreateScheduleRequest {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface Branch {
  id: string;
  code: string;
  storeName: string;
  taxId: string;
  address: string;
  contactPhone: string;
  secondaryContactPhone: string | null;
  schedules: BranchSchedule[];
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface CreateBranchRequest {
  code: string;
  store_name: string;
  tax_id: string;
  address: string;
  contact_phone: string;
  secondary_contact_phone?: string;
  schedules: CreateScheduleRequest[];
}

export interface UpdateBranchRequest {
  store_name: string;
  tax_id: string;
  address: string;
  contact_phone: string;
  secondary_contact_phone?: string;
  schedules: CreateScheduleRequest[];
}
