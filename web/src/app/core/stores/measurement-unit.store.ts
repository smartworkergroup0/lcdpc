import { Injectable, computed, inject, signal } from '@angular/core';
import { MeasurementUnit } from '../models/measurement-unit.model';
import { MeasurementUnitApiService } from '../services/measurement-unit-api.service';

export interface MeasurementUnitOption {
  label: string;
  value: string;
}

@Injectable({ providedIn: 'root' })
export class MeasurementUnitStore {
  private readonly measurementUnitApi = inject(MeasurementUnitApiService);

  private readonly _measurementUnits = signal<MeasurementUnit[]>([]);
  private readonly _loading = signal(false);

  readonly measurementUnits = this._measurementUnits.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly measurementUnitMap = computed(
    () => new Map(this._measurementUnits().map((mu) => [mu.id, mu.name]))
  );

  readonly measurementUnitOptions = computed(() =>
    this._measurementUnits().map((mu) => ({
      label: mu.symbol ? `${mu.name} (${mu.symbol})` : mu.name,
      value: mu.id,
    }))
  );

  load(): void {
    if (this._measurementUnits().length > 0) return;
    this._loading.set(true);
    this.measurementUnitApi.list().subscribe({
      next: (measurementUnits) => {
        this._measurementUnits.set(measurementUnits);
        this._loading.set(false);
      },
      error: () => {
        this._loading.set(false);
      },
    });
  }

  getMeasurementUnitName(id: string | null): string {
    if (!id) return 'Sin unidad de medida';
    return this.measurementUnitMap().get(id) ?? 'Sin unidad de medida';
  }

  refresh(): void {
    this._measurementUnits.set([]);
    this.load();
  }
}
