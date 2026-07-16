import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, inject, signal, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { FloatLabelModule } from 'primeng/floatlabel';
import { Client } from '../../../core/models/client.model';
import { ClientApiService } from '../../../core/services/client-api.service';
import { DOCUMENT_TYPE_OPTIONS } from '../../../core/models/document-type.model';

@Component({
  selector: 'app-client-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, SelectModule, FloatLabelModule,
  ],
  template: `
    <p-dialog [header]="isEditMode ? 'Editar Cliente' : 'Nuevo Cliente'"
              [visible]="visible" (visibleChange)="visibleChange.emit($event)"
              [modal]="true" [dismissableMask]="true" [draggable]="false"
              [style]="{width: 'min(550px, 95vw)'}"
              (onHide)="close()">
      <div class="form-fields" [style]="{marginTop: '25px'}">
        <div class="field">
          <p-floatlabel>
            <input pInputText id="name" [(ngModel)]="form.name"
                   [class.ng-invalid]="submitted && !form.name" style="width: 100%" placeholder=" " />
            <label for="name">Nombre *</label>
          </p-floatlabel>
        </div>

        <div class="field-row">
          <div class="field">
            <p-select id="documentType" [options]="documentTypes" [(ngModel)]="form.documentType"
                      optionLabel="label" optionValue="value"
                      placeholder="Tipo" [style]="{'width':'100%'}" />
          </div>
          <div class="field">
            <p-floatlabel>
              <input pInputText id="documentNumber" [(ngModel)]="form.documentNumber"
                     [class.ng-invalid]="submitted && !form.documentNumber" style="width: 100%" placeholder=" " />
              <label for="documentNumber">Numero de documento *</label>
            </p-floatlabel>
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <p-floatlabel>
              <input pInputText id="whatsappPhone" [(ngModel)]="form.whatsappPhone"
                     [class.ng-invalid]="submitted && !form.whatsappPhone" style="width: 100%" placeholder=" " />
              <label for="whatsappPhone">WhatsApp *</label>
            </p-floatlabel>
          </div>
          <div class="field">
            <p-floatlabel>
              <input pInputText id="fullAddress" [(ngModel)]="form.fullAddress"
                     [class.ng-invalid]="submitted && !form.fullAddress" style="width: 100%" placeholder=" " />
              <label for="fullAddress">Direccion *</label>
            </p-floatlabel>
          </div>
        </div>
      </div>

      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" (onClick)="close()"></p-button>
        <p-button [label]="isEditMode ? 'Guardar Cambios' : 'Crear Cliente'"
                  icon="pi pi-check" [loading]="saving()" (onClick)="save()"></p-button>
      </ng-template>
    </p-dialog>
  `,
  styles: [`:host ::ng-deep .p-dialog-header { padding-bottom: 0; } .form-fields { display: flex; flex-direction: column; gap: 1.75rem; } .field { display: flex; flex-direction: column; gap: 0.25rem; } .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; } @media (max-width: 600px) { .field-row { grid-template-columns: 1fr; } }`],
})
export class ClientFormDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() client: Client | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private readonly clientApi = inject(ClientApiService);

  protected readonly saving = signal(false);
  protected submitted = false;
  protected form = this.emptyForm();

  protected readonly documentTypes = DOCUMENT_TYPE_OPTIONS;

  protected get isEditMode(): boolean {
    return this.client !== null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['client'] || changes['visible']) && this.visible) {
      if (this.client) {
        this.form = this.buildForm(this.client);
      } else {
        this.form = this.emptyForm();
      }
      this.submitted = false;
    }
  }

  save(): void {
    this.submitted = true;
    if (!this.form.name || !this.form.documentNumber || !this.form.whatsappPhone || !this.form.fullAddress) return;

    this.saving.set(true);
    const base = {
      name: this.form.name,
      identity_document: `${this.form.documentType}${this.form.documentNumber}`,
      whatsapp_phone: this.form.whatsappPhone,
      full_address: this.form.fullAddress,
    };
    const operation = this.isEditMode
      ? this.clientApi.update(this.client!.id, base)
      : this.clientApi.create(base);

    operation.subscribe({
      next: () => { this.saving.set(false); this.saved.emit(); },
      error: () => this.saving.set(false),
    });
  }

  close(): void {
    this.closed.emit();
  }

  private buildForm(client: Client): ReturnType<typeof this.emptyForm> {
    let documentType = 'V';
    let documentNumber = '';
    const doc = client.identityDocument;
    if (doc && doc.length > 1 && /^[VEJGCP]/.test(doc)) {
      documentType = doc[0];
      documentNumber = doc.substring(1);
    } else {
      documentNumber = doc ?? '';
    }
    return {
      name: client.name,
      documentType,
      documentNumber,
      whatsappPhone: client.whatsappPhone,
      fullAddress: client.fullAddress,
    };
  }

  private emptyForm() {
    return {
      name: '',
      documentType: 'V',
      documentNumber: '',
      whatsappPhone: '',
      fullAddress: '',
    };
  }
}
