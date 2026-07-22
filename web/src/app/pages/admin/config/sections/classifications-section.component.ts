import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthStore } from '../../../../core/auth/auth.store';
import { MeasurementUnitClassificationApiService } from '../../../../core/services/measurement-unit-classification-api.service';
import { MeasurementUnitClassification } from '../../../../core/models/measurement-unit-classification.model';
import { ClassificationFormDialogComponent } from './classification-form-dialog.component';

@Component({
  selector: 'app-classifications-section',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule,
    ConfirmDialogModule, ToastModule, TooltipModule, TagModule,
    ClassificationFormDialogComponent,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './classifications-section.component.html',
})
export class ClassificationsSectionComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly classificationApi = inject(MeasurementUnitClassificationApiService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly canCreate = computed(() => this.authStore.hasPermission('measurement_unit:create'));
  protected readonly canUpdate = computed(() => this.authStore.hasPermission('measurement_unit:update'));
  protected readonly canDelete = computed(() => this.authStore.hasPermission('measurement_unit:delete'));
  protected readonly canModify = computed(() => this.canUpdate() || this.canDelete());

  protected readonly items = signal<MeasurementUnitClassification[]>([]);
  protected readonly loading = signal(false);
  protected readonly dialogVisible = signal(false);
  protected readonly selectedItem = signal<MeasurementUnitClassification | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.classificationApi.list().subscribe({
      next: (data) => { this.items.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openCreate(): void {
    this.selectedItem.set(null);
    this.dialogVisible.set(true);
  }

  openEdit(item: MeasurementUnitClassification): void {
    this.selectedItem.set(item);
    this.dialogVisible.set(true);
  }

  onDialogClose(saved: boolean): void {
    this.dialogVisible.set(false);
    this.selectedItem.set(null);
    if (saved) {
      this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Clasificacion guardada' });
      this.load();
    }
  }

  confirmDelete(item: MeasurementUnitClassification): void {
    this.confirmationService.confirm({
      message: `Eliminar la clasificacion "${item.name}"?`,
      header: 'Confirmar eliminacion',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.classificationApi.delete(item.id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Clasificacion eliminada' });
            this.load();
          },
          error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar' }),
        });
      },
    });
  }
}
