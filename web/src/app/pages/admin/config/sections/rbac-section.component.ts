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
import { TabsModule } from 'primeng/tabs';
import { InputNumberModule } from 'primeng/inputnumber';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthStore } from '../../../../core/auth/auth.store';
import { RbacApiService } from '../../../../core/services/rbac-api.service';
import { ApiTokenApiService } from '../../../../core/services/api-token-api.service';
import { ServiceAccountApiService } from '../../../../core/services/service-account-api.service';
import {
  Resource, Role, Profile,
  CreateResourceRequest, CreateRoleRequest, CreateProfileRequest,
} from '../../../../core/models/rbac.model';
import { ApiToken, CreateApiTokenRequest } from '../../../../core/models/api-token.model';
import {
  ServiceAccount,
  CreateServiceAccountRequest,
  UpdateServiceAccountRequest,
} from '../../../../core/models/service-account.model';

@Component({
  selector: 'app-rbac-section',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule,
    TagModule, DialogModule, InputTextModule, FloatLabelModule,
    SelectModule, ConfirmDialogModule, ToastModule, TooltipModule,
    TabsModule, InputNumberModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './rbac-section.component.html',
  styleUrl: './rbac-section.component.scss',
})
export class RbacSectionComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly rbacApi = inject(RbacApiService);
  private readonly apiTokenApi = inject(ApiTokenApiService);
  private readonly svcAccountApi = inject(ServiceAccountApiService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly canCreate = computed(() => this.authStore.hasPermission('rbac:resource:create'));
  protected readonly canUpdate = computed(() => this.authStore.hasPermission('rbac:resource:update'));
  protected readonly canDelete = computed(() => this.authStore.hasPermission('rbac:resource:delete'));

  protected readonly canCreateToken = computed(() => this.authStore.hasPermission('api_token:create'));
  protected readonly canUpdateToken = computed(() => this.authStore.hasPermission('api_token:update'));
  protected readonly canDeleteToken = computed(() => this.authStore.hasPermission('api_token:delete'));

  protected readonly canCreateSA = computed(() => this.authStore.hasPermission('service_account:create'));
  protected readonly canUpdateSA = computed(() => this.authStore.hasPermission('service_account:update'));
  protected readonly canDeleteSA = computed(() => this.authStore.hasPermission('service_account:delete'));

  // Resources
  protected readonly resources = signal<Resource[]>([]);
  protected readonly resourceDialogVisible = signal(false);
  protected readonly selectedResource = signal<Resource | null>(null);
  protected resourceForm: CreateResourceRequest = { code: '' };
  protected resourceSubmitted = false;

  // Roles
  protected readonly roles = signal<Role[]>([]);
  protected readonly roleDialogVisible = signal(false);
  protected readonly selectedRole = signal<Role | null>(null);
  protected roleForm: CreateRoleRequest = { code: '', name: '', description: '' };
  protected roleSubmitted = false;

  // Role resources dialog
  protected readonly roleResourcesDialogVisible = signal(false);
  protected readonly roleResourcesTarget = signal<Role | null>(null);
  protected selectedResourceId: string | null = null;

  // Profiles
  protected readonly profiles = signal<Profile[]>([]);
  protected readonly profileDialogVisible = signal(false);
  protected readonly selectedProfile = signal<Profile | null>(null);
  protected profileForm: CreateProfileRequest = { name: '', code: '' };
  protected profileSubmitted = false;

  // Profile roles dialog
  protected readonly profileRolesDialogVisible = signal(false);
  protected readonly profileRolesTarget = signal<Profile | null>(null);
  protected selectedRoleId: string | null = null;

  // API Tokens
  protected readonly apiTokens = signal<ApiToken[]>([]);
  protected readonly apiTokenDialogVisible = signal(false);
  protected readonly selectedApiToken = signal<ApiToken | null>(null);
  protected apiTokenForm: CreateApiTokenRequest = { name: '' };
  protected apiTokenSubmitted = false;
  protected readonly createdTokenVisible = signal(false);
  protected createdTokenRaw = '';

  // Service Accounts
  protected readonly serviceAccounts = signal<ServiceAccount[]>([]);
  protected readonly svcAccountDialogVisible = signal(false);
  protected readonly selectedSvcAccount = signal<ServiceAccount | null>(null);
  protected svcAccountForm: CreateServiceAccountRequest = { name: '', username: '', password: '', profile_id: '' };
  protected svcAccountSubmitted = false;
  protected readonly createdPasswordVisible = signal(false);
  protected createdPasswordRaw = '';

  protected readonly saving = signal(false);
  protected readonly loading = signal(false);

  protected readonly availableResources = computed(() => {
    const target = this.roleResourcesTarget();
    if (!target) return this.resources().map((r) => ({ label: r.code, value: r.id }));
    const assigned = new Set(target.resources.map((r) => r.id));
    return this.resources().filter((r) => !assigned.has(r.id)).map((r) => ({ label: r.code, value: r.id }));
  });

  protected readonly availableRoles = computed(() => {
    const target = this.profileRolesTarget();
    if (!target) return this.roles().map((r) => ({ label: `${r.name} (${r.code})`, value: r.id }));
    const assigned = new Set(target.roles.map((r) => r.id));
    return this.roles().filter((r) => !assigned.has(r.id)).map((r) => ({ label: `${r.name} (${r.code})`, value: r.id }));
  });

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.loading.set(true);
    this.rbacApi.listResources().subscribe({ next: (d) => this.resources.set(d) });
    this.rbacApi.listRoles().subscribe({ next: (d) => this.roles.set(d) });
    this.rbacApi.listProfiles().subscribe({
      next: (d) => { this.profiles.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.apiTokenApi.list().subscribe({ next: (d) => this.apiTokens.set(d) });
    this.svcAccountApi.list().subscribe({ next: (d) => this.serviceAccounts.set(d) });
  }

  protected readonly profileOptions = computed(() =>
    this.profiles().map((p) => ({ label: `${p.name} (${p.code})`, value: p.id }))
  );

  // ── Resources ──

  openResourceCreate(): void {
    this.selectedResource.set(null);
    this.resourceForm = { code: '' };
    this.resourceSubmitted = false;
    this.resourceDialogVisible.set(true);
  }

  openResourceEdit(resource: Resource): void {
    this.selectedResource.set(resource);
    this.resourceForm = { code: resource.code };
    this.resourceSubmitted = false;
    this.resourceDialogVisible.set(true);
  }

  saveResource(): void {
    this.resourceSubmitted = true;
    if (!this.resourceForm.code) return;
    this.saving.set(true);
    const op = this.selectedResource()
      ? this.rbacApi.updateResource(this.selectedResource()!.id, this.resourceForm)
      : this.rbacApi.createResource(this.resourceForm);
    op.subscribe({
      next: () => { this.saving.set(false); this.resourceDialogVisible.set(false); this.loadAll(); },
      error: () => this.saving.set(false),
    });
  }

  confirmDeleteResource(resource: Resource): void {
    this.confirmationService.confirm({
      message: `Eliminar el recurso "${resource.code}"?`,
      header: 'Confirmar',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.rbacApi.deleteResource(resource.id).subscribe({
          next: () => { this.messageService.add({ severity: 'success', summary: 'Exito' }); this.loadAll(); },
          error: () => this.messageService.add({ severity: 'error', summary: 'Error' }),
        });
      },
    });
  }

  // ── Roles ──

  openRoleCreate(): void {
    this.selectedRole.set(null);
    this.roleForm = { code: '', name: '', description: '' };
    this.roleSubmitted = false;
    this.roleDialogVisible.set(true);
  }

  openRoleEdit(role: Role): void {
    this.selectedRole.set(role);
    this.roleForm = { code: role.code, name: role.name, description: role.description };
    this.roleSubmitted = false;
    this.roleDialogVisible.set(true);
  }

  saveRole(): void {
    this.roleSubmitted = true;
    if (!this.roleForm.code || !this.roleForm.name) return;
    this.saving.set(true);
    const op = this.selectedRole()
      ? this.rbacApi.updateRole(this.selectedRole()!.id, this.roleForm)
      : this.rbacApi.createRole(this.roleForm);
    op.subscribe({
      next: () => { this.saving.set(false); this.roleDialogVisible.set(false); this.loadAll(); },
      error: () => this.saving.set(false),
    });
  }

  confirmDeleteRole(role: Role): void {
    this.confirmationService.confirm({
      message: `Eliminar el rol "${role.name}"?`,
      header: 'Confirmar',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.rbacApi.deleteRole(role.id).subscribe({
          next: () => { this.messageService.add({ severity: 'success', summary: 'Exito' }); this.loadAll(); },
          error: () => this.messageService.add({ severity: 'error', summary: 'Error' }),
        });
      },
    });
  }

  openRoleResources(role: Role): void {
    this.roleResourcesTarget.set(role);
    this.selectedResourceId = null;
    this.roleResourcesDialogVisible.set(true);
  }

  assignResourceToRole(): void {
    const roleId = this.roleResourcesTarget()?.id;
    if (!roleId || !this.selectedResourceId) return;
    this.rbacApi.assignResourceToRole(roleId, { resource_id: this.selectedResourceId }).subscribe({
      next: () => {
        this.selectedResourceId = null;
        this.rbacApi.getRole(roleId).subscribe({ next: (r) => this.roleResourcesTarget.set(r) });
        this.loadAll();
      },
    });
  }

  removeResourceFromRole(resourceId: string): void {
    const roleId = this.roleResourcesTarget()?.id;
    if (!roleId) return;
    this.rbacApi.removeResourceFromRole(roleId, resourceId).subscribe({
      next: () => {
        this.rbacApi.getRole(roleId).subscribe({ next: (r) => this.roleResourcesTarget.set(r) });
        this.loadAll();
      },
    });
  }

  // ── Profiles ──

  openProfileCreate(): void {
    this.selectedProfile.set(null);
    this.profileForm = { name: '', code: '' };
    this.profileSubmitted = false;
    this.profileDialogVisible.set(true);
  }

  openProfileEdit(profile: Profile): void {
    this.selectedProfile.set(profile);
    this.profileForm = { name: profile.name, code: profile.code };
    this.profileSubmitted = false;
    this.profileDialogVisible.set(true);
  }

  saveProfile(): void {
    this.profileSubmitted = true;
    if (!this.profileForm.name || !this.profileForm.code) return;
    this.saving.set(true);
    const op = this.selectedProfile()
      ? this.rbacApi.updateProfile(this.selectedProfile()!.id, this.profileForm)
      : this.rbacApi.createProfile(this.profileForm);
    op.subscribe({
      next: () => { this.saving.set(false); this.profileDialogVisible.set(false); this.loadAll(); },
      error: () => this.saving.set(false),
    });
  }

  confirmDeleteProfile(profile: Profile): void {
    this.confirmationService.confirm({
      message: `Eliminar el perfil "${profile.name}"?`,
      header: 'Confirmar',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.rbacApi.deleteProfile(profile.id).subscribe({
          next: () => { this.messageService.add({ severity: 'success', summary: 'Exito' }); this.loadAll(); },
          error: () => this.messageService.add({ severity: 'error', summary: 'Error' }),
        });
      },
    });
  }

  openProfileRoles(profile: Profile): void {
    this.profileRolesTarget.set(profile);
    this.selectedRoleId = null;
    this.profileRolesDialogVisible.set(true);
  }

  assignRoleToProfile(): void {
    const profileId = this.profileRolesTarget()?.id;
    if (!profileId || !this.selectedRoleId) return;
    this.rbacApi.assignRoleToProfile(profileId, { role_id: this.selectedRoleId }).subscribe({
      next: () => {
        this.selectedRoleId = null;
        this.rbacApi.getProfile(profileId).subscribe({ next: (p) => this.profileRolesTarget.set(p) });
        this.loadAll();
      },
    });
  }

  removeRoleFromProfile(roleId: string): void {
    const profileId = this.profileRolesTarget()?.id;
    if (!profileId) return;
    this.rbacApi.removeRoleFromProfile(profileId, roleId).subscribe({
      next: () => {
        this.rbacApi.getProfile(profileId).subscribe({ next: (p) => this.profileRolesTarget.set(p) });
        this.loadAll();
      },
    });
  }

  // ── API Tokens ──

  openApiTokenCreate(): void {
    this.selectedApiToken.set(null);
    this.apiTokenForm = { name: '' };
    this.apiTokenSubmitted = false;
    this.apiTokenDialogVisible.set(true);
  }

  openApiTokenEdit(token: ApiToken): void {
    this.selectedApiToken.set(token);
    this.apiTokenForm = { name: token.name };
    this.apiTokenSubmitted = false;
    this.apiTokenDialogVisible.set(true);
  }

  saveApiToken(): void {
    this.apiTokenSubmitted = true;
    if (!this.apiTokenForm.name) return;
    this.saving.set(true);
    if (this.selectedApiToken()) {
      this.apiTokenApi.update(this.selectedApiToken()!.id, {
        name: this.apiTokenForm.name,
        is_active: this.selectedApiToken()!.isActive,
      }).subscribe({
        next: () => { this.saving.set(false); this.apiTokenDialogVisible.set(false); this.loadAll(); },
        error: () => this.saving.set(false),
      });
    } else {
      this.apiTokenApi.create(this.apiTokenForm).subscribe({
        next: (result) => {
          this.saving.set(false);
          this.apiTokenDialogVisible.set(false);
          this.createdTokenRaw = result.rawToken;
          this.createdTokenVisible.set(true);
          this.loadAll();
        },
        error: () => this.saving.set(false),
      });
    }
  }

  toggleApiTokenActive(token: ApiToken): void {
    this.apiTokenApi.update(token.id, { name: token.name, is_active: !token.isActive }).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Exito' });
        this.loadAll();
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error' }),
    });
  }

  confirmDeleteApiToken(token: ApiToken): void {
    this.confirmationService.confirm({
      message: `Eliminar el token "${token.name}"? Las sincronizaciones que lo usen dejaran de funcionar.`,
      header: 'Confirmar',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.apiTokenApi.delete(token.id).subscribe({
          next: () => { this.messageService.add({ severity: 'success', summary: 'Exito' }); this.loadAll(); },
          error: () => this.messageService.add({ severity: 'error', summary: 'Error' }),
        });
      },
    });
  }

  copyToken(): void {
    navigator.clipboard.writeText(this.createdTokenRaw);
    this.messageService.add({ severity: 'success', summary: 'Copiado' });
  }

  // ── Service Accounts ──

  openSvcAccountCreate(): void {
    this.selectedSvcAccount.set(null);
    this.svcAccountForm = { name: '', username: '', password: '', profile_id: '' };
    this.svcAccountSubmitted = false;
    this.svcAccountDialogVisible.set(true);
  }

  openSvcAccountEdit(sa: ServiceAccount): void {
    this.selectedSvcAccount.set(sa);
    this.svcAccountForm = { name: sa.name, username: sa.username, password: '', profile_id: sa.profileId, token_expiry_hours: sa.tokenExpiryHours };
    this.svcAccountSubmitted = false;
    this.svcAccountDialogVisible.set(true);
  }

  saveSvcAccount(): void {
    this.svcAccountSubmitted = true;
    const isEdit = !!this.selectedSvcAccount();

    if (!this.svcAccountForm.name) return;
    if (!isEdit && (!this.svcAccountForm.username || !this.svcAccountForm.password)) return;
    if (!this.svcAccountForm.profile_id) return;

    this.saving.set(true);

    if (isEdit) {
      const req: UpdateServiceAccountRequest = {
        name: this.svcAccountForm.name,
        is_active: this.selectedSvcAccount()!.isActive,
        profile_id: this.svcAccountForm.profile_id,
        token_expiry_hours: this.svcAccountForm.token_expiry_hours,
      };
      this.svcAccountApi.update(this.selectedSvcAccount()!.id, req).subscribe({
        next: () => { this.saving.set(false); this.svcAccountDialogVisible.set(false); this.loadAll(); },
        error: () => this.saving.set(false),
      });
    } else {
      this.svcAccountApi.create(this.svcAccountForm).subscribe({
        next: (result) => {
          this.saving.set(false);
          this.svcAccountDialogVisible.set(false);
          this.createdPasswordRaw = result.rawPassword;
          this.createdPasswordVisible.set(true);
          this.loadAll();
        },
        error: () => this.saving.set(false),
      });
    }
  }

  toggleSvcAccountActive(sa: ServiceAccount): void {
    this.svcAccountApi.update(sa.id, {
      name: sa.name,
      is_active: !sa.isActive,
      profile_id: sa.profileId,
      token_expiry_hours: sa.tokenExpiryHours,
    }).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Exito' });
        this.loadAll();
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error' }),
    });
  }

  confirmDeleteSvcAccount(sa: ServiceAccount): void {
    this.confirmationService.confirm({
      message: `Eliminar la cuenta de servicio "${sa.name}"?`,
      header: 'Confirmar',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.svcAccountApi.delete(sa.id).subscribe({
          next: () => { this.messageService.add({ severity: 'success', summary: 'Exito' }); this.loadAll(); },
          error: () => this.messageService.add({ severity: 'error', summary: 'Error' }),
        });
      },
    });
  }

  copyPassword(): void {
    navigator.clipboard.writeText(this.createdPasswordRaw);
    this.messageService.add({ severity: 'success', summary: 'Copiado' });
  }
}
