export interface Category {
  categoryId: string;
  name: string;
  code: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface CreateCategoryRequest {
  name: string;
  code: string;
}

export interface UpdateCategoryRequest {
  name?: string;
  code?: string;
}
