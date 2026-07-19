import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnChanges, Output, signal, SimpleChanges, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { FloatLabelModule } from 'primeng/floatlabel';
import { AuthStore } from '../../../core/auth/auth.store';
import { CreateStaffRequest, ProfileOption, StaffLookupResult, StaffMember, UpdateStaffRequest } from '../../../core/models/staff.model';
import { StaffApiService } from '../../../core/services/staff-api.service';
import { DOCUMENT_TYPE_OPTIONS, DocumentType } from '../../../core/models/document-type.model';

@Component({
  selector: 'app-staff-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, PasswordModule, SelectModule, FloatLabelModule
  ],
  templateUrl: './staff-form-dialog.component.html',
  styleUrl: './staff-form-dialog.component.scss'
})
export class StaffFormDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() staff: StaffMember | null = null;
  @Input() branches: { id: string; name: string }[] = [];

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private readonly authStore = inject(AuthStore);
  private readonly staffApi = inject(StaffApiService);

  protected readonly saving = signal(false);
  protected readonly canViewAllBranches = computed(() => this.authStore.hasPermission('view:branch:all'));
  protected readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);
  protected submitted = false;

  protected email = '';
  protected password = '';
  protected name = '';
  protected identityDocument = '';
  protected whatsappPhone = '';
  protected fullAddress = '';
  protected branchId = '';
  protected profileId = '';

  protected readonly profileOptions = signal<ProfileOption[]>([]);

  protected readonly documentTypeOptions = DOCUMENT_TYPE_OPTIONS;
  protected searchDocumentType: DocumentType = 'V';
  protected searchDocumentNumber = '';
  protected readonly searching = signal(false);
  protected readonly searchMode = signal(true);
  protected readonly foundPerson = signal<StaffLookupResult | null>(null);
  protected readonly clientDataReadonly = signal(false);
  protected personId: string | null = null;

  protected get isEditMode(): boolean {
    return this.staff !== null;
  }

  protected get showSearch(): boolean {
    return !this.isEditMode && this.searchMode();
  }

  protected get showStaffWarning(): boolean {
    return !this.isEditMode && !this.searchMode() && !!this.foundPerson()?.exists && !!this.foundPerson()?.is_staff;
  }

  protected get showClientForm(): boolean {
    return !this.isEditMode && !this.searchMode() && !!this.foundPerson()?.exists && !this.foundPerson()?.is_staff && this.foundPerson()?.person != null;
  }

  protected get showEmptyForm(): boolean {
    return !this.isEditMode && !this.searchMode() && (!this.foundPerson()?.exists || this.foundPerson()?.person == null);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['staff'] || changes['visible']) {
      if (this.visible) {
        this.loadProfiles();

        if (this.staff) {
          this.email = this.staff.email;
          this.password = '';
          this.name = this.staff.profileName;
          this.identityDocument = this.staff.identityDocument;
          this.whatsappPhone = this.staff.whatsappPhone;
          this.fullAddress = '';
          this.branchId = this.staff.branchId ?? '';
          this.profileId = this.staff.profileId;
        } else {
          this.resetForm();
          if (!this.canViewAllBranches() && this.userBranchId()) {
            this.branchId = this.userBranchId() ?? '';
          }
        }
        this.submitted = false;
      }
    }
  }

  private loadProfiles(): void {
    this.staffApi.listProfiles().subscribe({
      next: (profiles) => this.profileOptions.set(profiles),
      error: () => this.profileOptions.set([]),
    });
  }

  protected searchByDocument(): void {
    if (this.searching()) return;
    const doc = `${this.searchDocumentType}${this.searchDocumentNumber}`.trim();
    if (!doc || !this.searchDocumentNumber.trim()) return;

    this.searching.set(true);
    this.foundPerson.set(null);

    this.staffApi.lookupByDocument(doc).subscribe({
      next: (result) => {
        this.searching.set(false);
        this.foundPerson.set(result);

        if (!result.exists) {
          this.searchMode.set(false);
          return;
        }

        if (result.is_staff) {
          this.searchMode.set(false);
          return;
        }

        if (result.person) {
          this.searchMode.set(false);
          this.clientDataReadonly.set(true);
          this.personId = result.person.id;
          this.name = result.person.name;
          this.identityDocument = result.person.identity_document;
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
    this.clientDataReadonly.set(false);
    this.personId = null;
    this.searchDocumentNumber = '';
    this.resetForm();
    if (!this.canViewAllBranches() && this.userBranchId()) {
      this.branchId = this.userBranchId() ?? '';
    }
    this.submitted = false;
  }

  save(): void {
    this.submitted = true;

    if (this.isEditMode) {
      if (!this.name || !this.profileId) return;

      this.saving.set(true);
      const req: UpdateStaffRequest = {
        name: this.name,
        identity_document: this.identityDocument || undefined,
        whatsapp_phone: this.whatsappPhone || undefined,
        full_address: this.fullAddress || undefined,
        branch_id: this.branchId || undefined,
        profile_id: this.profileId,
      };

      this.staffApi.update(this.staff!.userId, req).subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.emit();
        },
        error: () => this.saving.set(false),
      });
    } else {
      if (!this.email || !this.password || !this.name || !this.identityDocument || !this.whatsappPhone || !this.fullAddress || !this.branchId || !this.profileId) return;

      this.saving.set(true);
      const req: CreateStaffRequest = {
        email: this.email,
        password: this.password,
        name: this.name,
        identity_document: this.identityDocument,
        whatsapp_phone: this.whatsappPhone,
        full_address: this.fullAddress,
        branch_id: this.branchId,
        profile_id: this.profileId,
        ...(this.personId ? { person_id: this.personId } : {}),
      };

      this.staffApi.create(req).subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.emit();
        },
        error: () => this.saving.set(false),
      });
    }
  }

  close(): void {
    this.closed.emit();
  }

  private resetForm(): void {
    this.email = '';
    this.password = '';
    this.name = '';
    this.identityDocument = '';
    this.whatsappPhone = '';
    this.fullAddress = '';
    this.branchId = '';
    this.profileId = '';
  }
}
