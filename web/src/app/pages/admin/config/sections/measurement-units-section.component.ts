import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthStore } from '../../../../core/auth/auth.store';
import { MeasurementUnitApiService } from '../../../../core/services/measurement-unit-api.service';
import { MeasurementUnitClassificationApiService } from '../../../../core/services/measurement-unit-classification-api.service';
import { MeasurementUnit, CreateMeasurementUnitRequest } from '../../../../core/models/measurement-unit.model';
import { MeasurementUnitClassification } from '../../../../core/models/measurement-unit-classification.model';
import { MeasurementUnitFormDialogComponent } from './measurement-unit-form-dialog.component';

@Component({
  selector: 'app-measurement-units-section',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule,
    ConfirmDialogModule, ToastModule, TooltipModule,
    MeasurementUnitFormDialogComponent,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './measurement-units-section.component.html',
})
export class MeasurementUnitsSectionComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly unitApi = inject(MeasurementUnitApiService);
  private readonly classificationApi = inject(MeasurementUnitClassificationApiService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly canRead = computed(() => this.authStore.hasPermission('measurement_unit:view'));
  protected readonly canCreate = computed(() => this.authStore.hasPermission('measurement_unit:create'));
  protected readonly canUpdate = computed(() => this.authStore.hasPermission('measurement_unit:update'));
  protected readonly canDelete = computed(() => this.authStore.hasPermission('measurement_unit:delete'));
  protected readonly canModify = computed(() => this.canUpdate() || this.canDelete());

  protected readonly items = signal<MeasurementUnit[]>([]);
  protected readonly classifications = signal<MeasurementUnitClassification[]>([]);
  protected readonly loading = signal(false);
  protected readonly dialogVisible = signal(false);
  protected readonly selectedItem = signal<MeasurementUnit | null>(null);

  ngOnInit(): void {
    this.load();
    this.classificationApi.list().subscribe({
      next: (data) => this.classifications.set(data),
    });
  }

  load(): void {
    this.loading.set(true);
    this.unitApi.list().subscribe({
      next: (data) => { this.items.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openCreate(): void {
    this.selectedItem.set(null);
    this.dialogVisible.set(true);
  }

  openEdit(item: MeasurementUnit): void {
    this.selectedItem.set(item);
    this.dialogVisible.set(true);
  }

  onDialogClose(saved: boolean): void {
    this.dialogVisible.set(false);
    this.selectedItem.set(null);
    if (saved) {
      this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Unidad de medida guardada' });
      this.load();
    }
  }

  getClassificationName(id: string | null): string {
    if (!id) return '—';
    return this.classifications().find((c) => c.id === id)?.name ?? '—';
  }

  confirmDelete(item: MeasurementUnit): void {
    this.confirmationService.confirm({
      message: `Eliminar la unidad de medida "${item.name}"?`,
      header: 'Confirmar eliminacion',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.unitApi.delete(item.id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Unidad eliminada' });
            this.load();
          },
          error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar' }),
        });
      },
    });
  }
}
