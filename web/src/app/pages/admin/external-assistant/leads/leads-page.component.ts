import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ExternalAssistantApiService } from '../../../../core/services/external-assistant-api.service';
import { AssistantSessionStore } from '../../../../core/stores/assistant-session.store';
import {
  AssistantLead,
  ASSISTANT_LEAD_STATUS_LABELS,
} from '../../../../core/models/external-assistant.model';

@Component({
  selector: 'app-assistant-leads-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule, TagModule,
    ToastModule,
  ],
  providers: [MessageService],
  template: `
    <section class="leads-page">
      @if (!sessionStore.selectedSessionId()) {
        <div class="no-session-warning">
          <p>Selecciona una cuenta de servicio para ver los leads.</p>
        </div>
      } @else {
        <p-table [value]="leads()" [lazy]="true" [paginator]="true"
                 [rows]="pageSize" [totalRecords]="totalCount()" [loading]="loading()"
                 (onLazyLoad)="loadLeads($event)" styleClass="admin-table">
          <ng-template pTemplate="header">
            <tr>
              <th>Nombre</th>
              <th>Telefono</th>
              <th>Email</th>
              <th>Status</th>
              <th style="width: 80px">Puntaje</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-lead>
            <tr>
              <td>{{ lead.firstName }} {{ lead.lastName }}</td>
              <td>{{ lead.phone }}</td>
              <td>{{ lead.email }}</td>
              <td>
                <p-tag [value]="getStatusLabel(lead.status)" [severity]="getStatusSeverity(lead.status)" />
              </td>
              <td>{{ lead.score }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="5" class="empty-state">No hay leads disponibles</td>
            </tr>
          </ng-template>
        </p-table>
      }
    </section>
    <p-toast />
  `,
  styles: `
    .leads-page { display: flex; flex-direction: column; gap: 1rem; }
    .empty-state { text-align: center; padding: 2rem; color: var(--text-soft); }
    .no-session-warning { text-align: center; padding: 3rem; color: var(--text-soft); background: var(--surface); border-radius: 8px; }
  `,
})
export class AssistantLeadsPageComponent {
  private readonly assistantApi = inject(ExternalAssistantApiService);
  private readonly messageService = inject(MessageService);
  protected readonly sessionStore = inject(AssistantSessionStore);

  protected readonly leads = signal<AssistantLead[]>([]);
  protected readonly loading = signal(false);
  protected readonly totalCount = signal(0);
  protected readonly pageSize = 10;

  loadLeads(event: any): void {
    const sessionId = this.sessionStore.selectedSessionId();
    if (!sessionId) return;

    const offset = event.first ?? 0;
    const limit = event.rows ?? this.pageSize;
    this.loading.set(true);

    this.assistantApi.listLeads(sessionId, { limit, offset }).subscribe({
      next: (res) => {
        this.leads.set(res.items);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar los leads' });
        this.loading.set(false);
      },
    });
  }

  getStatusLabel(status: string): string {
    return ASSISTANT_LEAD_STATUS_LABELS[status] ?? status;
  }

  getStatusSeverity(status: string): 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast' {
    const map: Record<string, 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast'> = {
      nuevo: 'info',
      en_conversacion: 'warn',
      calificado: 'success',
      cliente: 'success',
      descartado: 'danger',
      bloqueado: 'danger',
      vendido: 'success',
    };
    return map[status] ?? 'secondary';
  }
}
