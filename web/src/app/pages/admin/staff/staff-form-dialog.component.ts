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
import { CreateStaffRequest, StaffMember, UpdateStaffRequest } from '../../../core/models/staff.model';
import { StaffApiService } from '../../../core/services/staff-api.service';

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
  protected code = '';
  protected identityDocument = '';
  protected whatsappPhone = '';
  protected fullAddress = '';
  protected branchId = '';
  protected roleCode = 'staff';

  protected readonly roleOptions = [
    { label: 'Staff', value: 'staff' },
    { label: 'Manager', value: 'manager' },
  ];

  protected get isEditMode(): boolean {
    return this.staff !== null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['staff'] || changes['visible']) {
      if (this.visible && this.staff) {
        this.email = this.staff.email;
        this.password = '';
        this.name = this.staff.profileName;
        this.code = this.staff.profileCode;
        this.identityDocument = this.staff.identityDocument;
        this.whatsappPhone = this.staff.whatsappPhone;
        this.fullAddress = '';
        this.branchId = this.staff.branchId ?? '';
        this.roleCode = this.staff.roleCode;
      } else if (this.visible) {
        this.resetForm();
        if (!this.canViewAllBranches() && this.userBranchId()) {
          this.branchId = this.userBranchId() ?? '';
        }
      }
      this.submitted = false;
    }
  }

  save(): void {
    this.submitted = true;

    if (this.isEditMode) {
      if (!this.name || !this.code) return;

      this.saving.set(true);
      const req: UpdateStaffRequest = {
        name: this.name,
        code: this.code,
        identity_document: this.identityDocument || undefined,
        whatsapp_phone: this.whatsappPhone || undefined,
        full_address: this.fullAddress || undefined,
        branch_id: this.branchId || undefined,
        role_code: this.roleCode,
      };

      this.staffApi.update(this.staff!.userId, req).subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.emit();
        },
        error: () => this.saving.set(false),
      });
    } else {
      if (!this.email || !this.password || !this.name || !this.code || !this.identityDocument || !this.whatsappPhone || !this.fullAddress || !this.branchId) return;

      this.saving.set(true);
      const req: CreateStaffRequest = {
        email: this.email,
        password: this.password,
        name: this.name,
        code: this.code,
        identity_document: this.identityDocument,
        whatsapp_phone: this.whatsappPhone,
        full_address: this.fullAddress,
        branch_id: this.branchId,
        role_code: this.roleCode,
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
    this.code = '';
    this.identityDocument = '';
    this.whatsappPhone = '';
    this.fullAddress = '';
    this.branchId = '';
    this.roleCode = 'staff';
  }
}
