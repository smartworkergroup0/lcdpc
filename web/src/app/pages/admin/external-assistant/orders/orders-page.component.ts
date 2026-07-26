import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ToolbarModule } from 'primeng/toolbar';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ExternalAssistantApiService } from '../../../../core/services/external-assistant-api.service';
import {
  AssistantOrder,
  ASSISTANT_ORDER_STATUS_LABELS,
  ASSISTANT_ORDER_STATUS_OPTIONS,
} from '../../../../core/models/external-assistant.model';
import { AssistantAcceptDialogComponent } from './assistant-accept-dialog.component';

@Component({
  selector: 'app-assistant-orders-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule, TagModule,
    SelectModule, InputTextModule, IconFieldModule, InputIconModule,
    ToolbarModule, ToastModule, ConfirmDialogModule,
    AssistantAcceptDialogComponent,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <section class="orders-page">
      <p-toolbar styleClass="admin-toolbar">
        <ng-template pTemplate="start">
          <p-iconfield>
            <p-inputicon><i class="pi pi-search"></i></p-inputicon>
            <input pInputText type="text" placeholder="Buscar ordenes..." [(ngModel)]="filterSearch" (keyup.enter)="applyFilters()" />
          </p-iconfield>
        </ng-template>
        <ng-template pTemplate="end">
          <p-select [options]="statusOptions" [(ngModel)]="filterStatus" optionLabel="label" optionValue="value" placeholder="Todos los status" [showClear]="true" (onChange)="applyFilters()"></p-select>
        </ng-template>
      </p-toolbar>

      <p-table [value]="orders()" [lazy]="true" [paginator]="true"
               [rows]="pageSize" [totalRecords]="totalCount()" [loading]="loading()"
               (onLazyLoad)="loadOrders($event)" styleClass="admin-table">
        <ng-template pTemplate="header">
          <tr>
            <th>Cliente</th>
            <th>Identificacion</th>
            <th>Direccion</th>
            <th>Resumen</th>
            <th>Status</th>
            <th>Opciones</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-order>
          <tr>
            <td>{{ order.customerName }}</td>
            <td><code>{{ order.identification }}</code></td>
            <td>{{ order.address }}</td>
            <td>{{ order.summary }}</td>
            <td>
              <p-tag [value]="getStatusLabel(order.status)" [severity]="getStatusSeverity(order.status)" />
            </td>
            <td>
              @if (order.status === 'PENDIENTE') {
                <div class="action-buttons">
                  <p-button icon="pi pi-check" severity="success" [rounded]="true" [text]="true"
                            pTooltip="Atender" (onClick)="openAcceptDialog(order)" />
                  <p-button icon="pi pi-times" severity="danger" [rounded]="true" [text]="true"
                            pTooltip="Rechazar" (onClick)="confirmReject(order)" />
                </div>
              }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr>
            <td colspan="6" class="empty-state">No hay ordenes disponibles</td>
          </tr>
        </ng-template>
      </p-table>
    </section>

    <app-assistant-accept-dialog
      [visible]="showAcceptDialog()"
      [order]="selectedOrder()"
      (visibleChange)="showAcceptDialog.set($event)"
      (saved)="onAcceptSaved()" />

    <p-toast />
    <p-confirmDialog />
  `,
  styles: `
    .orders-page { display: flex; flex-direction: column; gap: 1rem; }
    .empty-state { text-align: center; padding: 2rem; color: var(--text-soft); }
    .action-buttons { display: flex; gap: 0.25rem; }
  `,
})
export class AssistantOrdersPageComponent {
  private readonly assistantApi = inject(ExternalAssistantApiService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  protected readonly orders = signal<AssistantOrder[]>([]);
  protected readonly loading = signal(false);
  protected readonly totalCount = signal(0);
  protected readonly pageSize = 10;

  protected filterSearch = '';
  protected filterStatus: string | null = null;

  protected readonly statusOptions = ASSISTANT_ORDER_STATUS_OPTIONS;

  protected readonly showAcceptDialog = signal(false);
  protected readonly selectedOrder = signal<AssistantOrder | null>(null);

  loadOrders(event: any): void {
    const offset = event.first ?? 0;
    const limit = event.rows ?? this.pageSize;
    this.loading.set(true);

    const filter: Record<string, any> = { limit, offset };
    if (this.filterSearch) filter['search'] = this.filterSearch;
    if (this.filterStatus) filter['status'] = this.filterStatus;

    this.assistantApi.listOrders(filter).subscribe({
      next: (res) => {
        this.orders.set(res.items);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las ordenes' });
        this.loading.set(false);
      },
    });
  }

  applyFilters(): void {
    this.loadOrders({ first: 0, rows: this.pageSize });
  }

  getStatusLabel(status: string): string {
    return ASSISTANT_ORDER_STATUS_LABELS[status] ?? status;
  }

  getStatusSeverity(status: string): 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast' {
    const map: Record<string, 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast'> = {
      PENDIENTE: 'warn',
      PROCESADO: 'success',
      CANCELADO: 'danger',
    };
    return map[status] ?? 'secondary';
  }

  protected openAcceptDialog(order: AssistantOrder): void {
    this.selectedOrder.set(order);
    this.showAcceptDialog.set(true);
  }

  protected confirmReject(order: AssistantOrder): void {
    this.confirmationService.confirm({
      header: 'Rechazar Orden',
      message: `¿Estas seguro de rechazar la orden de ${order.customerName}? Esta accion no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Rechazar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.rejectOrder(order),
    });
  }

  private rejectOrder(order: AssistantOrder): void {
    this.loading.set(true);
    this.assistantApi.rejectOrder(order.id).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Orden rechazada correctamente' });
        this.loadOrders({ first: 0, rows: this.pageSize });
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo rechazar la orden' });
        this.loading.set(false);
      },
    });
  }

  protected onAcceptSaved(): void {
    this.showAcceptDialog.set(false);
    this.selectedOrder.set(null);
    this.loadOrders({ first: 0, rows: this.pageSize });
  }
}
