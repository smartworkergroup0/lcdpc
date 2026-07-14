import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnChanges, Output, signal, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { FloatLabelModule } from 'primeng/floatlabel';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { PersonApiService } from '../../../core/services/person-api.service';
import { Person, UpsertPersonRequest } from '../../../core/models/person.model';

@Component({
  selector: 'app-client-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, FloatLabelModule, ToastModule,
  ],
  providers: [MessageService],
  template: `
    <p-toast />
    <p-dialog [header]="isEditMode ? 'Actualizar Cliente' : 'Nuevo Cliente'"
              [visible]="visible" (visibleChange)="visibleChange.emit($event)"
              [modal]="true" [dismissableMask]="true" [draggable]="false"
              [style]="{width: 'min(500px, 95vw)', paddingTop: '20px'}"
              (onHide)="close()">
      <div class="form-fields">
        <div class="field">
          <p-floatlabel>
            <input pInputText id="identityDocument" [(ngModel)]="form.identityDocument"
                   [readonly]="true" style="width: 100%" placeholder=" " />
            <label for="identityDocument">Documento de Identidad</label>
          </p-floatlabel>
        </div>

        <div class="field">
          <p-floatlabel>
            <input pInputText id="name" [(ngModel)]="form.name"
                   [class.ng-invalid]="submitted && !form.name"
                   style="width: 100%" placeholder=" " />
            <label for="name">Nombre *</label>
          </p-floatlabel>
        </div>

        <div class="field">
          <p-floatlabel>
            <input pInputText id="whatsappPhone" [(ngModel)]="form.whatsappPhone"
                   [class.ng-invalid]="submitted && !form.whatsappPhone"
                   style="width: 100%" placeholder=" " />
            <label for="whatsappPhone">Teléfono *</label>
          </p-floatlabel>
        </div>

        <div class="field">
          <p-floatlabel>
            <input pInputText id="fullAddress" [(ngModel)]="form.fullAddress"
                   [class.ng-invalid]="submitted && !form.fullAddress"
                   style="width: 100%" placeholder=" " />
            <label for="fullAddress">Dirección *</label>
          </p-floatlabel>
        </div>

        <div class="field">
          <p-floatlabel>
            <input pInputText id="taxId" [(ngModel)]="form.taxId"
                   style="width: 100%" placeholder=" " />
            <label for="taxId">RIF</label>
          </p-floatlabel>
        </div>
      </div>

      <ng-template pTemplate="footer">
        <div class="footer-left">
          <p-button label="Volver" icon="pi pi-arrow-left" severity="secondary"
                    (onClick)="goBack()" />
        </div>
        <div class="footer-right">
          <p-button label="Cerrar" severity="secondary" (onClick)="close()" />
          <p-button [label]="isEditMode ? 'Actualizar Cliente' : 'Crear Cliente'"
                    icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
        </div>
      </ng-template>
    </p-dialog>
  `,
  styles: [`
    :host ::ng-deep .p-dialog-footer {
      display: flex;
      justify-content: space-between;
    }
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
    .footer-left,
    .footer-right {
      display: flex;
      gap: 0.5rem;
    }
  `],
})
export class ClientFormDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() identityDocument = '';
  @Input() person: Person | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() clientCreated = new EventEmitter<Person>();
  @Output() back = new EventEmitter<void>();

  private readonly personApi = inject(PersonApiService);
  private readonly messageService = inject(MessageService);

  protected readonly saving = signal(false);
  protected submitted = false;

  protected form = this.emptyForm();

  protected get isEditMode(): boolean {
    return this.person !== null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.submitted = false;
      this.saving.set(false);

      if (this.person) {
        this.form = {
          identityDocument: this.person.identityDocument,
          name: this.person.name,
          whatsappPhone: this.person.whatsappPhone,
          fullAddress: this.person.fullAddress,
          taxId: this.person.taxId ?? '',
        };
      } else {
        this.form = this.emptyForm();
        this.form.identityDocument = this.identityDocument;
      }
    }
  }

  protected save(): void {
    this.submitted = true;
    if (!this.form.name || !this.form.whatsappPhone || !this.form.fullAddress) return;
    if (this.saving()) return;

    this.saving.set(true);

    const req: UpsertPersonRequest = {
      name: this.form.name,
      identityDocument: this.form.identityDocument,
      taxId: this.form.taxId || null,
      whatsappPhone: this.form.whatsappPhone,
      fullAddress: this.form.fullAddress,
    };

    this.personApi.createClient(req).subscribe({
      next: (person) => {
        this.saving.set(false);
        this.clientCreated.emit(person);
      },
      error: () => {
        this.saving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo guardar el cliente',
        });
      },
    });
  }

  protected goBack(): void {
    this.visibleChange.emit(false);
    this.back.emit();
  }

  protected close(): void {
    this.visibleChange.emit(false);
  }

  private emptyForm() {
    return {
      identityDocument: '',
      name: '',
      whatsappPhone: '',
      fullAddress: '',
      taxId: '',
    };
  }
}
