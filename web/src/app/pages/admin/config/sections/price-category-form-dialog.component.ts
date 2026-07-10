import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, inject, signal, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { FloatLabelModule } from 'primeng/floatlabel';
import { PriceCategory, CreatePriceCategoryRequest } from '../../../../core/models/price-category.model';
import { PriceCategoryApiService } from '../../../../core/services/price-category-api.service';

@Component({
  selector: 'app-price-category-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, FloatLabelModule,
  ],
  template: `
    <p-dialog [header]="isEditMode ? 'Editar Categoria de Precio' : 'Nueva Categoria de Precio'"
              [visible]="visible" (visibleChange)="visibleChange.emit($event)"
              [modal]="true" [dismissableMask]="true" [style]="{width: 'min(500px, 95vw)', paddingTop: '20px'}"
              (onHide)="close()" [draggable]="false">
      <div class="form-fields" [style]="{paddingTop: '20px'}">
        <div class="field">
          <p-floatlabel>
            <input pInputText id="name" [(ngModel)]="form.name" [class.ng-invalid]="submitted && !form.name" style="width: 100%" placeholder=" " />
            <label for="name">Nombre *</label>
          </p-floatlabel>
        </div>
        <div class="field">
          <p-floatlabel>
            <input pInputText id="code" [(ngModel)]="form.code" [class.ng-invalid]="submitted && !form.code" style="width: 100%" placeholder=" " />
            <label for="code">Codigo *</label>
          </p-floatlabel>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" (onClick)="close()"></p-button>
        <p-button [label]="isEditMode ? 'Guardar Cambios' : 'Crear Categoria'"
                  icon="pi pi-check" [loading]="saving()" (onClick)="save()"></p-button>
      </ng-template>
    </p-dialog>
  `,
  styles: [`.form-fields { display: flex; flex-direction: column; gap: 1.75rem; } .field { display: flex; flex-direction: column; gap: 0.25rem; }`],
})
export class PriceCategoryFormDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() item: PriceCategory | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private readonly priceCategoryApi = inject(PriceCategoryApiService);

  protected readonly saving = signal(false);
  protected submitted = false;
  protected form: CreatePriceCategoryRequest = { name: '', code: '' };

  protected get isEditMode(): boolean {
    return this.item !== null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['item'] || changes['visible']) && this.visible) {
      if (this.item) {
        this.form = { name: this.item.name, code: this.item.code };
      } else {
        this.form = { name: '', code: '' };
      }
      this.submitted = false;
    }
  }

  save(): void {
    this.submitted = true;
    if (!this.form.name || !this.form.code) return;

    this.saving.set(true);
    const operation = this.isEditMode
      ? this.priceCategoryApi.update(this.item!.id, this.form)
      : this.priceCategoryApi.create(this.form);

    operation.subscribe({
      next: () => { this.saving.set(false); this.saved.emit(); },
      error: () => this.saving.set(false),
    });
  }

  close(): void {
    this.closed.emit();
  }
}
