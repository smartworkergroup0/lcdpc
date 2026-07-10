import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, inject, signal, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { CheckboxModule } from 'primeng/checkbox';
import { FloatLabelModule } from 'primeng/floatlabel';
import { SystemConfig, CreateSystemConfigRequest, UpdateSystemConfigRequest } from '../../../../core/models/system-config.model';
import { SystemConfigApiService } from '../../../../core/services/system-config-api.service';

@Component({
  selector: 'app-system-config-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, CheckboxModule, FloatLabelModule,
  ],
  template: `
    <p-dialog [header]="isEditMode ? 'Editar Configuracion' : 'Nueva Configuracion'"
              [visible]="visible" (visibleChange)="visibleChange.emit($event)"
              [modal]="true" [dismissableMask]="true" [draggable]="false"
              [style]="{width: 'min(550px, 95vw)'}"
              (onHide)="close()">
      <div class="form-fields" [style]="{paddingTop: '20px'}">
        <div class="field">
          <p-floatlabel>
            <input pInputText id="pageName" [(ngModel)]="form.page_name"
                   [class.ng-invalid]="submitted && !form.page_name" style="width: 100%" placeholder=" " />
            <label for="pageName">Nombre de Pagina *</label>
          </p-floatlabel>
        </div>

        <div class="field">
          <p-floatlabel>
            <input pInputText id="title" [(ngModel)]="form.title"
                   [class.ng-invalid]="submitted && !form.title" style="width: 100%" placeholder=" " />
            <label for="title">Titulo del Navegador *</label>
          </p-floatlabel>
        </div>

        <div class="field">
          <label class="field-label">Logo</label>
          <div class="image-upload">
            @if (logoPreview) {
              <div class="image-preview">
                <img [src]="logoPreview" alt="logo preview" />
                <p-button icon="pi pi-times" severity="danger" [text]="true" size="small" (onClick)="removeLogo()" />
              </div>
            }
            <input type="file" accept="image/*" (change)="onLogoSelect($event)" #logoInput />
          </div>
        </div>

        <div class="field">
          <label class="field-label">Icono</label>
          <div class="image-upload">
            @if (iconPreview) {
              <div class="image-preview">
                <img [src]="iconPreview" alt="icon preview" />
                <p-button icon="pi pi-times" severity="danger" [text]="true" size="small" (onClick)="removeIcon()" />
              </div>
            }
            <input type="file" accept="image/*" (change)="onIconSelect($event)" #iconInput />
          </div>
        </div>

        <div class="field checkbox-field">
          <p-checkbox [(ngModel)]="form.show_price_in_catalog" [binary]="true" inputId="showPrice" />
          <label for="showPrice" class="checkbox-label">Mostrar precios en catalogo</label>
        </div>

        <div class="field checkbox-field">
          <p-checkbox [(ngModel)]="form.negative_stock" [binary]="true" inputId="negativeStock" />
          <label for="negativeStock" class="checkbox-label">Permitir stock negativo</label>
        </div>

        <div class="field checkbox-field">
          <p-checkbox [(ngModel)]="form.active" [binary]="true" inputId="active" />
          <label for="active" class="checkbox-label">Activo</label>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" (onClick)="close()" />
        <p-button [label]="isEditMode ? 'Guardar Cambios' : 'Crear Configuracion'"
                  icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [`
    .form-fields {
      display: flex;
      flex-direction: column;
      gap: 1.75rem;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .field-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-soft);
    }
    .checkbox-field {
      flex-direction: row;
      align-items: center;
      gap: 0.5rem;
    }
    .checkbox-label {
      font-size: 0.875rem;
      color: var(--text-soft);
      cursor: pointer;
    }
    .image-upload {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .image-preview {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .image-preview img {
      max-height: 48px;
      max-width: 120px;
      border-radius: 4px;
      border: 1px solid var(--border);
    }
  `],
})
export class SystemConfigFormDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() entity: SystemConfig | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private readonly systemConfigApi = inject(SystemConfigApiService);

  protected readonly saving = signal(false);
  protected submitted = false;
  protected logoFile: File | null = null;
  protected iconFile: File | null = null;
  protected logoPreview: string | null = null;
  protected iconPreview: string | null = null;

  protected form = this.emptyForm();

  protected get isEditMode(): boolean {
    return this.entity !== null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['entity'] || changes['visible']) && this.visible) {
      if (this.entity) {
        this.form = {
          page_name: this.entity.pageName,
          title: this.entity.title,
          show_price_in_catalog: this.entity.showPriceInCatalog,
          negative_stock: this.entity.negativeStock,
          active: this.entity.active,
        };
        this.logoPreview = this.systemConfigApi.resolveImageUrl(this.entity.logoPath);
        this.iconPreview = this.systemConfigApi.resolveImageUrl(this.entity.iconPath);
      } else {
        this.form = this.emptyForm();
        this.logoPreview = null;
        this.iconPreview = null;
      }
      this.logoFile = null;
      this.iconFile = null;
      this.submitted = false;
    }
  }

  onLogoSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.logoFile = input.files[0];
      const reader = new FileReader();
      reader.onload = () => { this.logoPreview = reader.result as string; };
      reader.readAsDataURL(this.logoFile);
    }
  }

  onIconSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.iconFile = input.files[0];
      const reader = new FileReader();
      reader.onload = () => { this.iconPreview = reader.result as string; };
      reader.readAsDataURL(this.iconFile);
    }
  }

  removeLogo(): void {
    this.logoFile = null;
    this.logoPreview = null;
  }

  removeIcon(): void {
    this.iconFile = null;
    this.iconPreview = null;
  }

  save(): void {
    this.submitted = true;
    if (!this.form.page_name || !this.form.title) {
      return;
    }

    this.saving.set(true);

    if (this.isEditMode) {
      const req: UpdateSystemConfigRequest = {
        page_name: this.form.page_name,
        title: this.form.title,
        show_price_in_catalog: this.form.show_price_in_catalog,
        negative_stock: this.form.negative_stock,
        active: this.form.active,
      };
      this.systemConfigApi.update(this.entity!.id, req, this.logoFile ?? undefined, this.iconFile ?? undefined).subscribe({
        next: () => { this.saving.set(false); this.saved.emit(); },
        error: () => this.saving.set(false),
      });
    } else {
      const req: CreateSystemConfigRequest = {
        page_name: this.form.page_name,
        title: this.form.title,
        show_price_in_catalog: this.form.show_price_in_catalog,
        negative_stock: this.form.negative_stock,
        active: this.form.active,
      };
      this.systemConfigApi.create(req, this.logoFile ?? undefined, this.iconFile ?? undefined).subscribe({
        next: () => { this.saving.set(false); this.saved.emit(); },
        error: () => this.saving.set(false),
      });
    }
  }

  close(): void {
    this.closed.emit();
  }

  private emptyForm() {
    return {
      page_name: '',
      title: '',
      show_price_in_catalog: true,
      negative_stock: false,
      active: true,
    };
  }
}
