import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { FloatLabelModule } from 'primeng/floatlabel';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthStore } from '../../../../core/auth/auth.store';
import { BranchApiService } from '../../../../core/services/branch-api.service';
import { AssistantSessionApiService } from '../../../../core/services/assistant-session-api.service';
import {
  AssistantSession,
  CreateAssistantSessionRequest,
  UpdateAssistantSessionRequest,
} from '../../../../core/models/assistant-session.model';
import { Branch } from '../../../../core/models/branch.model';

@Component({
  selector: 'app-assistant-sessions-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule, TagModule,
    DialogModule, InputTextModule, FloatLabelModule, SelectModule,
    ConfirmDialogModule, ToastModule, TooltipModule,
  ],
  providers: [ConfirmationService, MessageService],
  template: `
    <section class="sessions-page">
      <div class="page-toolbar">
        @if (canCreate()) {
          <p-button label="Nueva Sesion" icon="pi pi-plus" size="small" (onClick)="openCreate()" />
        }
      </div>

      <p-table [value]="sessions()" [loading]="loading()" styleClass="admin-table">
        <ng-template pTemplate="header">
          <tr>
            <th>Username</th>
            <th>Sucursal</th>
            <th>Estado</th>
            <th>Creado</th>
            <th style="width: 140px">Acciones</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-session>
          <tr>
            <td><code>{{ session.username }}</code></td>
            <td>{{ session.branchName }}</td>
            <td>
              @if (session.isActive) {
                <p-tag value="Activo" severity="success" />
              } @else {
                <p-tag value="Inactivo" severity="danger" />
              }
            </td>
            <td>{{ session.createdAtUtc | date:'dd/MM/yyyy HH:mm' }}</td>
            <td>
              @if (canUpdate()) {
                <p-button icon="pi pi-pencil" [text]="true" [rounded]="true"
                          (onClick)="openEdit(session)" pTooltip="Editar" />
                @if (session.isActive) {
                  <p-button icon="pi pi-ban" [text]="true" [rounded]="true" severity="warn"
                            (onClick)="toggleActive(session)" pTooltip="Desactivar" />
                } @else {
                  <p-button icon="pi pi-check-circle" [text]="true" [rounded]="true" severity="success"
                            (onClick)="toggleActive(session)" pTooltip="Activar" />
                }
              }
              @if (canDelete()) {
                <p-button icon="pi pi-trash" [text]="true" [rounded]="true" severity="danger"
                          (onClick)="confirmDelete(session)" pTooltip="Eliminar" />
              }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="5" class="empty-state">No hay sesiones configuradas</td></tr>
        </ng-template>
      </p-table>
    </section>

    <p-dialog [header]="selectedSession() ? 'Editar Sesion' : 'Nueva Sesion'"
              [visible]="dialogVisible()" (visibleChange)="dialogVisible.set($event)"
              [modal]="true" [dismissableMask]="true" [draggable]="false" [style]="{width: 'min(500px, 95vw)'}"
              (onHide)="submitted = false">
      <div class="form-fields" [style]="{marginTop: '25px'}">
        <div class="field">
          <p-floatlabel>
            <input pInputText id="username" [(ngModel)]="form.username"
                   [class.ng-invalid]="submitted && !form.username" style="width: 100%" placeholder=" " />
            <label for="username">Username *</label>
          </p-floatlabel>
        </div>
        <div class="field">
          <p-floatlabel>
            <input pInputText id="password" type="password" [(ngModel)]="form.password"
                   [class.ng-invalid]="submitted && !form.password && !selectedSession()" style="width: 100%" placeholder=" " />
            <label for="password">Password {{ selectedSession() ? '' : '*' }}</label>
          </p-floatlabel>
          @if (selectedSession()) {
            <small class="field-hint">Dejar vacio para mantener el actual</small>
          }
        </div>
        @if (canViewAllBranches()) {
          <div class="field">
            <label class="field-label">Sucursal *</label>
            <p-select [options]="branchOptions()" [(ngModel)]="form.branch_id"
                      optionLabel="label" optionValue="value" placeholder="Seleccionar sucursal"
                      [class.ng-invalid]="submitted && !form.branch_id"
                      [style]="{'width':'100%'}" appendTo="body" />
          </div>
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" (onClick)="dialogVisible.set(false)" />
        <p-button [label]="selectedSession() ? 'Guardar Cambios' : 'Crear Sesion'"
                  icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>

    <p-confirmDialog />
    <p-toast />
  `,
  styles: `
    .sessions-page { display: flex; flex-direction: column; gap: 1rem; }
    .page-toolbar { display: flex; justify-content: flex-end; }
    .empty-state { text-align: center; padding: 2rem; color: var(--text-soft); }
    .form-fields { display: flex; flex-direction: column; gap: 1.75rem; }
    .field { display: flex; flex-direction: column; gap: 0.25rem; }
    .field-label { font-weight: 500; font-size: 0.875rem; color: var(--text-soft); }
    .field-hint { font-size: 0.75rem; color: var(--text-soft); margin-top: 0.25rem; }
    :host ::ng-deep .p-dialog-header { padding-bottom: 0; }
  `,
})
export class AssistantSessionsPageComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly branchApi = inject(BranchApiService);
  private readonly sessionApi = inject(AssistantSessionApiService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly canCreate = computed(() => this.authStore.hasPermission('assistant_session:create'));
  protected readonly canUpdate = computed(() => this.authStore.hasPermission('assistant_session:update'));
  protected readonly canDelete = computed(() => this.authStore.hasPermission('assistant_session:delete'));
  protected readonly canViewAllBranches = computed(() => this.authStore.hasPermission('view:branch:all'));
  protected readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);

  protected readonly sessions = signal<AssistantSession[]>([]);
  protected readonly branches = signal<Branch[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly dialogVisible = signal(false);
  protected readonly selectedSession = signal<AssistantSession | null>(null);

  protected form: { username: string; password: string; branch_id: string } = { username: '', password: '', branch_id: '' };
  protected submitted = false;

  protected readonly branchOptions = computed(() =>
    this.branches().map((b) => ({ label: `${b.code} - ${b.storeName}`, value: b.id }))
  );

  ngOnInit(): void {
    this.loadSessions();
    this.branchApi.listAdmin().subscribe({ next: (d) => this.branches.set(d) });
  }

  private loadSessions(): void {
    this.loading.set(true);
    this.sessionApi.list().subscribe({
      next: (d) => { this.sessions.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  protected openCreate(): void {
    this.selectedSession.set(null);
    this.form = { username: '', password: '', branch_id: '' };
    if (!this.canViewAllBranches() && this.userBranchId()) {
      this.form.branch_id = this.userBranchId()!;
    }
    this.submitted = false;
    this.dialogVisible.set(true);
  }

  protected openEdit(session: AssistantSession): void {
    this.selectedSession.set(session);
    this.form = { username: session.username, password: '', branch_id: session.branchId };
    this.submitted = false;
    this.dialogVisible.set(true);
  }

  protected save(): void {
    this.submitted = true;
    const isEdit = !!this.selectedSession();

    if (!this.form.username) return;
    if (!isEdit && !this.form.password) return;
    if (!this.form.branch_id) return;

    this.saving.set(true);

    if (isEdit) {
      const req: UpdateAssistantSessionRequest = {
        username: this.form.username,
        branch_id: this.form.branch_id,
        is_active: this.selectedSession()!.isActive,
      };
      if (this.form.password) {
        req.password = this.form.password;
      }
      this.sessionApi.update(this.selectedSession()!.id, req).subscribe({
        next: () => { this.saving.set(false); this.dialogVisible.set(false); this.loadSessions(); },
        error: () => this.saving.set(false),
      });
    } else {
      const req: CreateAssistantSessionRequest = {
        username: this.form.username,
        password: this.form.password,
        branch_id: this.form.branch_id,
      };
      this.sessionApi.create(req).subscribe({
        next: () => { this.saving.set(false); this.dialogVisible.set(false); this.loadSessions(); },
        error: () => this.saving.set(false),
      });
    }
  }

  protected toggleActive(session: AssistantSession): void {
    this.sessionApi.update(session.id, {
      username: session.username,
      branch_id: session.branchId,
      is_active: !session.isActive,
    }).subscribe({
      next: () => { this.messageService.add({ severity: 'success', summary: 'Exito' }); this.loadSessions(); },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error' }),
    });
  }

  protected confirmDelete(session: AssistantSession): void {
    this.confirmationService.confirm({
      message: `Eliminar la sesion "${session.username}"?`,
      header: 'Confirmar',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.sessionApi.delete(session.id).subscribe({
          next: () => { this.messageService.add({ severity: 'success', summary: 'Exito' }); this.loadSessions(); },
          error: () => this.messageService.add({ severity: 'error', summary: 'Error' }),
        });
      },
    });
  }
}
