export interface StaffMember {
  userId: string;
  email: string;
  status: string;
  branchId: string | null;
  branchName: string | null;
  identityDocument: string;
  whatsappPhone: string;
  profileId: string;
  profileName: string;
  profileCode: string;
  roleCode: string;
  roleName: string;
  createdAtUtc: string;
}

export interface CreateStaffRequest {
  email: string;
  password: string;
  name: string;
  code: string;
  identity_document: string;
  whatsapp_phone: string;
  full_address: string;
  branch_id: string;
  role_code: string;
}

export interface UpdateStaffRequest {
  name?: string;
  code?: string;
  identity_document?: string;
  whatsapp_phone?: string;
  full_address?: string;
  branch_id?: string;
  role_code?: string;
  status?: string;
}

export interface StaffListFilter {
  limit?: number;
  offset?: number;
  branch_id?: string;
  role_code?: string;
  search?: string;
}
