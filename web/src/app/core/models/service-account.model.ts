export interface ServiceAccount {
  id: string;
  name: string;
  username: string;
  profileId: string;
  profileName: string;
  tokenExpiryHours: number;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface CreateServiceAccountRequest {
  name: string;
  username: string;
  password: string;
  profile_id: string;
  token_expiry_hours?: number;
}

export interface CreateServiceAccountResult extends ServiceAccount {
  rawPassword: string;
}

export interface UpdateServiceAccountRequest {
  name: string;
  is_active: boolean;
  profile_id: string;
  token_expiry_hours?: number;
}
