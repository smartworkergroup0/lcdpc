export interface StaffMember {
  userId: string;
  personName: string;
  email: string;
  status: string;
  branchId: string | null;
  branchName: string | null;
  identityDocument: string;
  whatsappPhone: string;
  profileId: string;
  profileName: string;
  createdAtUtc: string;
}

export interface CreateStaffRequest {
  email: string;
  password: string;
  name: string;
  identity_document: string;
  whatsapp_phone: string;
  full_address: string;
  branch_id: string;
  profile_id: string;
  person_id?: string;
}

export interface UpdateStaffRequest {
  name?: string;
  identity_document?: string;
  whatsapp_phone?: string;
  full_address?: string;
  branch_id?: string;
  profile_id?: string;
  status?: string;
}

export interface StaffListFilter {
  limit?: number;
  offset?: number;
  branch_id?: string;
  role_code?: string;
  search?: string;
}

export interface StaffLookupResult {
  exists: boolean;
  is_client: boolean;
  is_staff: boolean;
  has_user: boolean;
  user_id?: string;
  person?: {
    id: string;
    name: string;
    identity_document: string;
    whatsapp_phone: string;
    full_address: string;
  } | null;
}

export interface ProfileOption {
  id: string;
  name: string;
}
