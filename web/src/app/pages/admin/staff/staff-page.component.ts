import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToolbarModule } from 'primeng/toolbar';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthStore } from '../../../core/auth/auth.store';
import { AppUser } from '../../../core/models/user.model';
import { UserApiService } from '../../../core/services/user-api.service';

@Component({
  selector: 'app-staff-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule, TagModule,
    InputTextModule, FloatLabelModule, IconFieldModule, InputIconModule, SelectModule, ToolbarModule,
    ConfirmDialogModule, ToastModule, TooltipModule, DialogModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './staff-page.component.html',
  styleUrl: './staff-page.component.scss'
})
export class StaffPageComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly userApi = inject(UserApiService);
  private readonly messageService = inject(MessageService);

  protected readonly canUpdate = computed(() => this.authStore.hasPermission('rbac:user:update'));

  protected readonly personas = signal<AppUser[]>([]);
  protected readonly loading = signal(false);
  protected readonly totalCount = signal(0);
  protected readonly pageSize = 10;

  protected personasSearch = '';
  protected selectedIsClientFilter: 'all' | 'true' | 'false' = 'all';

  protected readonly detailVisible = signal(false);
  protected readonly editVisible = signal(false);
  protected readonly selectedPersona = signal<AppUser | null>(null);

  protected editForm = this.emptyEditForm();
  protected submitted = false;
  protected readonly saving = signal(false);

  ngOnInit(): void {
    this.loadPersonas({ first: 0, rows: this.pageSize });
  }

  loadPersonas(event: any): void {
    const offset = event.first ?? 0;
    const limit = event.rows ?? this.pageSize;
    this.loading.set(true);

    const query = this.personasSearch.trim();
    const request = query
      ? this.userApi.search(query, limit, offset)
      : this.userApi.list({ limit, offset });

    request.subscribe({
      next: (res) => {
        const personas = res.items.filter((person) => this.matchesClientFilter(person));
        this.personas.set(personas);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  applyPersonasFilters(): void {
    this.loadPersonas({ first: 0, rows: this.pageSize });
  }

  protected matchesClientFilter(person: AppUser): boolean {
    if (this.selectedIsClientFilter === 'all') return true;
    return this.selectedIsClientFilter === 'true' ? person.isClient === true : person.isClient === false;
  }

  roleSeverity(status: string): 'success' | 'warn' | 'info' | 'danger' {
    switch (status) {
      case 'active':
      case 'Active':
        return 'success';
      case 'inactive':
      case 'Inactive':
        return 'danger';
      default:
        return 'info';
    }
  }

  protected formatDate(value: string): string {
    return new Date(value).toLocaleDateString('es-VE', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  }

  openPersonaDetails(person: AppUser): void {
    this.selectedPersona.set(person);
    this.detailVisible.set(true);
  }

  closePersonaDetails(): void {
    this.detailVisible.set(false);
    this.selectedPersona.set(null);
  }

  openModifyPersona(person: AppUser): void {
    this.selectedPersona.set(person);
    this.editForm = {
      email: person.email,
      name: person.name ?? '',
      whatsappPhone: person.whatsappPhone ?? '',
      fullAddress: person.fullAddress ?? '',
    };
    this.submitted = false;
    this.editVisible.set(true);
  }

  closeModifyPersona(): void {
    this.editVisible.set(false);
    this.selectedPersona.set(null);
    this.editForm = this.emptyEditForm();
    this.submitted = false;
  }

  savePersonaChanges(): void {
    this.submitted = true;
    const person = this.selectedPersona();
    if (!person) return;
    if (!this.editForm.email || !this.editForm.name || !this.editForm.whatsappPhone || !this.editForm.fullAddress) return;

    this.saving.set(true);
    this.userApi.update(person.id, {
      email: this.editForm.email,
      name: this.editForm.name,
      whatsapp_phone: this.editForm.whatsappPhone,
      full_address: this.editForm.fullAddress,
    }).subscribe({
      next: (updated) => {
        this.personas.update((items) => items.map((item) => item.id === updated.id ? updated : item));
        this.selectedPersona.set(updated);
        this.saving.set(false);
        this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Persona actualizada correctamente' });
        this.closeModifyPersona();
      },
      error: () => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo actualizar la persona' });
      },
    });
  }

  private emptyEditForm(): { email: string; name: string; whatsappPhone: string; fullAddress: string } {
    return { email: '', name: '', whatsappPhone: '', fullAddress: '' };
  }
}
