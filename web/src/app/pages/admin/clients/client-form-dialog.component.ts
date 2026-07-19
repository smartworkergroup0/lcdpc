import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, inject, signal, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { FloatLabelModule } from 'primeng/floatlabel';
import { Client, ClientLookupResult } from '../../../core/models/client.model';
import { ClientApiService } from '../../../core/services/client-api.service';
import { DOCUMENT_TYPE_OPTIONS, DocumentType } from '../../../core/models/document-type.model';

@Component({
  selector: 'app-client-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, SelectModule, FloatLabelModule,
  ],
  templateUrl: './client-form-dialog.component.html',
  styleUrl: './client-form-dialog.component.scss'
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

  protected name = '';
  protected documentType: DocumentType = 'V';
  protected documentNumber = '';
  protected whatsappPhone = '';
  protected fullAddress = '';

  protected readonly documentTypeOptions = DOCUMENT_TYPE_OPTIONS;
  protected searchDocumentType: DocumentType = 'V';
  protected searchDocumentNumber = '';
  protected readonly searching = signal(false);
  protected readonly searchMode = signal(true);
  protected readonly foundPerson = signal<ClientLookupResult | null>(null);
  protected readonly personDataReadonly = signal(false);

  protected get isEditMode(): boolean {
    return this.client !== null;
  }

  protected get showSearch(): boolean {
    return !this.isEditMode && this.searchMode();
  }

  protected get showClientWarning(): boolean {
    return !this.isEditMode && !this.searchMode() && !!this.foundPerson()?.exists && !!this.foundPerson()?.person?.is_client;
  }

  protected get showExistingPerson(): boolean {
    return !this.isEditMode && !this.searchMode() && !!this.foundPerson()?.exists
      && !this.foundPerson()?.person?.is_client
      && this.foundPerson()?.person != null;
  }

  protected get showEmptyForm(): boolean {
    return !this.isEditMode && !this.searchMode() && (!this.foundPerson()?.exists || this.foundPerson()?.person == null);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['client'] || changes['visible']) {
      if (this.visible) {
        if (this.client) {
          this.populateFromClient(this.client);
        } else {
          this.resetForm();
        }
        this.submitted = false;
      }
    }
  }

  private populateFromClient(client: Client): void {
    this.name = client.name;
    const doc = client.identityDocument;
    if (doc && doc.length > 1 && /^[VEJGCP]/.test(doc)) {
      this.documentType = doc[0] as DocumentType;
      this.documentNumber = doc.substring(1);
    } else {
      this.documentType = 'V';
      this.documentNumber = doc ?? '';
    }
    this.whatsappPhone = client.whatsappPhone;
    this.fullAddress = client.fullAddress;
  }

  protected searchByDocument(): void {
    if (this.searching()) return;
    const doc = `${this.searchDocumentType}${this.searchDocumentNumber}`.trim();
    if (!doc || !this.searchDocumentNumber.trim()) return;

    this.searching.set(true);
    this.foundPerson.set(null);

    this.clientApi.lookupByDocument(doc).subscribe({
      next: (result) => {
        this.searching.set(false);
        this.foundPerson.set(result);

        if (!result.exists) {
          this.searchMode.set(false);
          return;
        }

        if (result.person?.is_client) {
          this.searchMode.set(false);
          return;
        }

        if (result.person) {
          this.searchMode.set(false);
          this.personDataReadonly.set(true);
          this.name = result.person.name;
          this.documentType = result.person.identity_document[0] as DocumentType || 'V';
          this.documentNumber = result.person.identity_document.substring(1);
          this.whatsappPhone = result.person.whatsapp_phone;
          this.fullAddress = result.person.full_address;
        }
      },
      error: () => {
        this.searching.set(false);
      },
    });
  }

  protected resetSearch(): void {
    this.searchMode.set(true);
    this.foundPerson.set(null);
    this.personDataReadonly.set(false);
    this.searchDocumentNumber = '';
    this.resetForm();
    this.submitted = false;
  }

  save(): void {
    this.submitted = true;

    if (this.isEditMode) {
      if (!this.name || !this.documentNumber || !this.whatsappPhone || !this.fullAddress) return;

      this.saving.set(true);
      const req = {
        name: this.name,
        identity_document: `${this.documentType}${this.documentNumber}`,
        whatsapp_phone: this.whatsappPhone,
        full_address: this.fullAddress,
      };

      this.clientApi.update(this.client!.id, req).subscribe({
        next: () => { this.saving.set(false); this.saved.emit(); },
        error: () => this.saving.set(false),
      });
    } else {
      if (!this.name || !this.documentNumber || !this.whatsappPhone || !this.fullAddress) return;

      this.saving.set(true);
      const req = {
        name: this.name,
        identity_document: `${this.documentType}${this.documentNumber}`,
        whatsapp_phone: this.whatsappPhone,
        full_address: this.fullAddress,
      };

      this.clientApi.create(req).subscribe({
        next: () => { this.saving.set(false); this.saved.emit(); },
        error: () => this.saving.set(false),
      });
    }
  }

  close(): void {
    this.closed.emit();
  }

  private resetForm(): void {
    this.name = '';
    this.documentType = 'V';
    this.documentNumber = '';
    this.whatsappPhone = '';
    this.fullAddress = '';
  }
}
