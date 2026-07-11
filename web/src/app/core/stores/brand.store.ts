import { Injectable, computed, inject, signal } from '@angular/core';
import { Brand } from '../models/brand.model';
import { BrandApiService } from '../services/brand-api.service';

export interface BrandOption {
  label: string;
  value: string;
}

@Injectable({ providedIn: 'root' })
export class BrandStore {
  private readonly brandApi = inject(BrandApiService);

  private readonly _brands = signal<Brand[]>([]);
  private readonly _loading = signal(false);

  readonly brands = this._brands.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly brandMap = computed(
    () => new Map(this._brands().map((b) => [b.id, b.name]))
  );

  readonly brandOptions = computed(() =>
    this._brands().map((b) => ({ label: b.name, value: b.id }))
  );

  load(): void {
    if (this._brands().length > 0) return;
    this._loading.set(true);
    this.brandApi.list().subscribe({
      next: (brands) => {
        this._brands.set(brands);
        this._loading.set(false);
      },
      error: () => {
        this._loading.set(false);
      },
    });
  }

  getBrandName(id: string | null): string {
    if (!id) return 'Sin marca';
    return this.brandMap().get(id) ?? 'Sin marca';
  }

  refresh(): void {
    this._brands.set([]);
    this.load();
  }
}
