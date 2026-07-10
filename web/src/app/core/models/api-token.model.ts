export interface ApiToken {
  id: string;
  name: string;
  isActive: boolean;
  createdAtUtc: string;
}

export interface CreateApiTokenRequest {
  name: string;
}

export interface CreateApiTokenResult extends ApiToken {
  rawToken: string;
}

export interface UpdateApiTokenRequest {
  name: string;
  is_active: boolean;
}
