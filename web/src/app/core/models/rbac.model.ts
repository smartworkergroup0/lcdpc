export interface Resource {
  id: string;
  code: string;
}

export interface CreateResourceRequest {
  code: string;
}

export interface UpdateResourceRequest {
  code: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string;
  resources: ResourceEntry[];
}

export interface ResourceEntry {
  id: string;
  code: string;
}

export interface CreateRoleRequest {
  code: string;
  name: string;
  description: string;
}

export interface UpdateRoleRequest {
  code: string;
  name: string;
  description: string;
}

export interface AssignResourceRequest {
  resource_id: string;
}

export interface Profile {
  id: string;
  name: string;
  code: string;
  roles: RoleEntry[];
  userCount: number;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface RoleEntry {
  id: string;
  code: string;
  name: string;
}

export interface CreateProfileRequest {
  name: string;
  code: string;
}

export interface UpdateProfileRequest {
  name: string;
  code: string;
}

export interface AssignRoleRequest {
  role_id: string;
}

export interface AssignProfileRequest {
  profile_id: string;
}
