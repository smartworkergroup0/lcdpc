import { Injectable, computed, inject, signal } from '@angular/core';
import { MeasurementUnitClassification } from '../models/measurement-unit-classification.model';
import { MeasurementUnitClassificationApiService } from '../services/measurement-unit-classification-api.service';

export interface MeasurementUnitClassificationOption {
  label: string;
  value: string;
}

@Injectable({ providedIn: 'root' })
export class MeasurementUnitClassificationStore {
  private readonly classificationApi = inject(MeasurementUnitClassificationApiService);

  private readonly _classifications = signal<MeasurementUnitClassification[]>([]);
  private readonly _loading = signal(false);

  readonly classifications = this._classifications.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly classificationMap = computed(
    () => new Map(this._classifications().map((c) => [c.id, c.name]))
  );

  readonly classificationDecimalMap = computed(
    () => new Map(this._classifications().map((c) => [c.id, c.canDecimalStock]))
  );

  readonly classificationOptions = computed(() =>
    this._classifications().map((c) => ({ label: c.name, value: c.id }))
  );

  load(): void {
    if (this._classifications().length > 0) return;
    this._loading.set(true);
    this.classificationApi.list().subscribe({
      next: (classifications) => {
        this._classifications.set(classifications);
        this._loading.set(false);
      },
      error: () => {
        this._loading.set(false);
      },
    });
  }

  getClassificationName(id: string | null): string {
    if (!id) return 'Sin clasificación';
    return this.classificationMap().get(id) ?? 'Sin clasificación';
  }

  canDecimalStock(classificationId: string | null | undefined): boolean {
    if (!classificationId) return false;
    return this.classificationDecimalMap().get(classificationId) ?? false;
  }

  refresh(): void {
    this._classifications.set([]);
    this.load();
  }
}
