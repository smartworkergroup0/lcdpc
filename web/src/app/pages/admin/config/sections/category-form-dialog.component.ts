import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, inject, signal, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { FloatLabelModule } from 'primeng/floatlabel';
import { Category, CreateCategoryRequest } from '../../../../core/models/category.model';
import { CategoryApiService } from '../../../../core/services/category-api.service';

@Component({
  selector: 'app-category-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, FloatLabelModule,
  ],
  template: `
    <p-dialog [header]="isEditMode ? 'Editar Categoria' : 'Nueva Categoria'"
              [visible]="visible" (visibleChange)="visibleChange.emit($event)"
              [modal]="true" [dismissableMask]="true" [style]="{width: 'min(500px, 95vw)'}"
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
            <label for="code">Código *</label>
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
export class CategoryFormDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() category: Category | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private readonly categoryApi = inject(CategoryApiService);

  protected readonly saving = signal(false);
  protected submitted = false;
  protected form: CreateCategoryRequest = this.emptyForm();

  protected get isEditMode(): boolean {
    return this.category !== null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['category'] || changes['visible']) && this.visible) {
      if (this.category) {
        this.form = {
          name: this.category.name,
          code: this.category.code,
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
      ? this.categoryApi.update(this.category!.categoryId, this.form)
      : this.categoryApi.create(this.form);

    operation.subscribe({
      next: () => { this.saving.set(false); this.saved.emit(); },
      error: () => this.saving.set(false),
    });
  }

  close(): void {
    this.closed.emit();
  }

  private emptyForm() {
    return { name: '', code: '' };
  }
}
