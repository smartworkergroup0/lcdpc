import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, inject, signal, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { FloatLabelModule } from 'primeng/floatlabel';
import { MeasurementUnitClassification, CreateMeasurementUnitClassificationRequest } from '../../../../core/models/measurement-unit-classification.model';
import { MeasurementUnitClassificationApiService } from '../../../../core/services/measurement-unit-classification-api.service';

@Component({
  selector: 'app-classification-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, FloatLabelModule,
  ],
  template: `
    <p-dialog [header]="isEditMode ? 'Editar Clasificacion' : 'Nueva Clasificacion'"
              [visible]="visible" (visibleChange)="visibleChange.emit($event)"
              [modal]="true" [dismissableMask]="true" [draggable]="false" [style]="{width: 'min(500px, 95vw)'}"
              (onHide)="close()">
      <div class="form-fields" [style]="{marginTop: '25px'}">
        <div class="field">
          <p-floatlabel>
            <input pInputText id="name" [(ngModel)]="form.name"
                   [class.ng-invalid]="submitted && !form.name" style="width: 100%" placeholder=" " />
            <label for="name">Nombre *</label>
          </p-floatlabel>
        </div>
        <div class="field">
          <p-floatlabel>
            <input pInputText id="code" [(ngModel)]="form.code"
                   [class.ng-invalid]="submitted && !form.code" style="width: 100%" placeholder=" " />
            <label for="code">Codigo *</label>
          </p-floatlabel>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" (onClick)="close()"></p-button>
        <p-button [label]="isEditMode ? 'Guardar Cambios' : 'Crear Clasificacion'"
                  icon="pi pi-check" [loading]="saving()" (onClick)="save()"></p-button>
      </ng-template>
    </p-dialog>
  `,
  styles: [`:host ::ng-deep .p-dialog-header { padding-bottom: 0; } .form-fields { display: flex; flex-direction: column; gap: 1.75rem; } .field { display: flex; flex-direction: column; gap: 0.25rem; }`],
})
export class ClassificationFormDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() item: MeasurementUnitClassification | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private readonly classificationApi = inject(MeasurementUnitClassificationApiService);

  protected readonly saving = signal(false);
  protected submitted = false;
  protected form: CreateMeasurementUnitClassificationRequest = this.emptyForm();

  protected get isEditMode(): boolean {
    return this.item !== null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['item'] || changes['visible']) && this.visible) {
      if (this.item) {
        this.form = {
          name: this.item.name,
          code: this.item.code,
        };
      } else {
        this.form = this.emptyForm();
      }
      this.submitted = false;
    }
  }

  save(): void {
    this.submitted = true;
    if (!this.form.name || !this.form.code) return;

    this.saving.set(true);
    const operation = this.isEditMode
      ? this.classificationApi.update(this.item!.id, this.form)
      : this.classificationApi.create(this.form);

    operation.subscribe({
      next: () => { this.saving.set(false); this.saved.emit(); },
      error: () => this.saving.set(false),
    });
  }

  close(): void {
    this.closed.emit();
  }

  private emptyForm(): CreateMeasurementUnitClassificationRequest {
    return { name: '', code: '' };
  }
}
