export interface AssistantSession {
  id: string;
  username: string;
  branchId: string;
  branchName: string;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface CreateAssistantSessionRequest {
  username: string;
  password: string;
  branch_id: string;
}

export interface UpdateAssistantSessionRequest {
  username: string;
  password?: string;
  branch_id: string;
  is_active: boolean;
}
