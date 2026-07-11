import { Injectable, computed, inject, signal } from '@angular/core';
import { Category } from '../models/category.model';
import { CategoryApiService } from '../services/category-api.service';

export interface CategoryFilter {
  id: string;
  label: string;
}

@Injectable({ providedIn: 'root' })
export class CategoryStore {
  private readonly categoryApi = inject(CategoryApiService);

  private readonly _categories = signal<Category[]>([]);
  private readonly _loading = signal(false);

  readonly categories = this._categories.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly categoryMap = computed(
    () => new Map(this._categories().map((c) => [c.categoryId, c.name]))
  );

  readonly categoryOptions = computed(() =>
    this._categories().map((c) => ({ label: c.name, value: c.categoryId }))
  );

  readonly filterOptions = computed<CategoryFilter[]>(() => [
    { id: 'all', label: 'Todos' },
    ...this._categories().map((c) => ({ id: c.categoryId, label: c.name })),
  ]);

  load(): void {
    if (this._categories().length > 0) return;
    this._loading.set(true);
    this.categoryApi.list().subscribe({
      next: (categories) => {
        this._categories.set(categories);
        this._loading.set(false);
      },
      error: () => {
        this._loading.set(false);
      },
    });
  }

  getCategoryName(id: string | null): string {
    if (!id) return 'Sin categoría';
    return this.categoryMap().get(id) ?? 'Sin categoría';
  }

  refresh(): void {
    this._categories.set([]);
    this.load();
  }
}
