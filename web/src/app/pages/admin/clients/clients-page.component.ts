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
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToolbarModule } from 'primeng/toolbar';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthStore } from '../../../core/auth/auth.store';
import { Client } from '../../../core/models/client.model';
import { ClientApiService } from '../../../core/services/client-api.service';
import { ClientFormDialogComponent } from './client-form-dialog.component';

@Component({
  selector: 'app-clients-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule, TagModule,
    InputTextModule, FloatLabelModule, IconFieldModule, InputIconModule, ToolbarModule,
    ConfirmDialogModule, ToastModule, TooltipModule, DialogModule,
    ClientFormDialogComponent,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './clients-page.component.html',
  styleUrl: './clients-page.component.scss'
})
export class ClientsPageComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly clientApi = inject(ClientApiService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly canCreate = computed(() => this.authStore.hasPermission('client:create'));
  protected readonly canUpdate = computed(() => this.authStore.hasPermission('client:update'));

  protected readonly items = signal<Client[]>([]);
  protected readonly loading = signal(false);
  protected readonly totalCount = signal(0);
  protected readonly pageSize = 10;

  protected search = '';

  protected readonly detailVisible = signal(false);
  protected readonly selectedItem = signal<Client | null>(null);
  protected readonly formVisible = signal(false);
  protected readonly editItem = signal<Client | null>(null);

  ngOnInit(): void {
    this.loadItems({ first: 0, rows: this.pageSize });
  }

  loadItems(event: TableLazyLoadEvent): void {
    const offset = event.first ?? 0;
    const limit = event.rows ?? this.pageSize;
    this.loading.set(true);

    const filters: Record<string, string> = {};
    if (this.search.trim()) filters['search'] = this.search.trim();

    this.clientApi.list({ ...filters, limit, offset } as any).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  applyFilters(): void {
    this.loadItems({ first: 0, rows: this.pageSize });
  }

  protected formatDate(value: string): string {
    return new Date(value).toLocaleDateString('es-VE', {
      year: 'numeric', month: 'short', day: '2-digit',
    });
  }

  openDetail(item: Client): void {
    this.selectedItem.set(item);
    this.detailVisible.set(true);
  }

  closeDetail(): void {
    this.detailVisible.set(false);
    this.selectedItem.set(null);
  }

  openCreate(): void {
    this.editItem.set(null);
    this.formVisible.set(true);
  }

  openEdit(item: Client): void {
    this.editItem.set(item);
    this.formVisible.set(true);
  }

  closeForm(): void {
    this.formVisible.set(false);
    this.editItem.set(null);
  }

  onFormSaved(): void {
    this.closeForm();
    this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Cliente guardado correctamente' });
    this.applyFilters();
  }
}
