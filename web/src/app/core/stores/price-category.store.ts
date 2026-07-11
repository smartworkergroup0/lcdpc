import { Injectable, computed, inject, signal } from '@angular/core';
import { PriceCategory } from '../models/price-category.model';
import { PriceCategoryApiService } from '../services/price-category-api.service';

export interface PriceCategoryOption {
  label: string;
  value: string;
}

@Injectable({ providedIn: 'root' })
export class PriceCategoryStore {
  private readonly priceCategoryApi = inject(PriceCategoryApiService);

  private readonly _priceCategories = signal<PriceCategory[]>([]);
  private readonly _loading = signal(false);

  readonly priceCategories = this._priceCategories.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly priceCategoryMap = computed(
    () => new Map(this._priceCategories().map((pc) => [pc.id, pc.name]))
  );

  readonly priceCategoryOptions = computed(() =>
    this._priceCategories().map((pc) => ({ label: pc.name, value: pc.id }))
  );

  load(): void {
    if (this._priceCategories().length > 0) return;
    this._loading.set(true);
    this.priceCategoryApi.list().subscribe({
      next: (priceCategories) => {
        this._priceCategories.set(priceCategories);
        this._loading.set(false);
      },
      error: () => {
        this._loading.set(false);
      },
    });
  }

  getPriceCategoryName(id: string | null): string {
    if (!id) return 'Sin categoría de precio';
    return this.priceCategoryMap().get(id) ?? 'Sin categoría de precio';
  }

  refresh(): void {
    this._priceCategories.set([]);
    this.load();
  }
}
