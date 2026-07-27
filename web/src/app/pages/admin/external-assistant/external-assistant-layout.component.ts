import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/stores/branch.store';
import { AssistantSessionStore } from '../../../core/stores/assistant-session.store';
import { AssistantSessionApiService } from '../../../core/services/assistant-session-api.service';
import { AssistantSession } from '../../../core/models/assistant-session.model';

@Component({
  selector: 'app-external-assistant-layout',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive, SelectModule],
  template: `
    <div class="assistant-layout">
      <div class="page-header">
        <h1>Asistente Virtual</h1>
        <div class="session-selector">
          @if (sessions().length > 0) {
            <p-select [options]="sessionOptions()" [(ngModel)]="selectedSessionId"
                      optionLabel="label" optionValue="value"
                      placeholder="Seleccionar cuenta" [style]="{'min-width': '250px'}"
                      appendTo="body" (onChange)="onSessionChange($event.value)" />
          } @else {
            <span class="no-sessions">No hay cuentas configuradas</span>
          }
        </div>
      </div>
      <nav class="assistant-nav">
        <a routerLink="/admin/external-assistant/leads" routerLinkActive="active">Leads</a>
        <a routerLink="/admin/external-assistant/orders" routerLinkActive="active">Ordenes</a>
        @if (canViewSessions()) {
          <a routerLink="/admin/external-assistant/sessions" routerLinkActive="active">Sesiones</a>
        }
      </nav>
      <div class="assistant-content">
        <router-outlet />
      </div>
    </div>
  `,
  styles: `
    .assistant-layout {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      h1 {
        font-family: var(--font-display);
        font-size: 1.75rem;
        color: var(--text-strong);
        margin: 0;
      }
    }
    .session-selector {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .no-sessions {
      font-size: 0.875rem;
      color: var(--text-soft);
      font-style: italic;
    }
    .assistant-nav {
      display: flex;
      gap: 0.5rem;
      border-bottom: 2px solid var(--border);
      padding-bottom: 0;
      a {
        padding: 0.75rem 1.25rem;
        font-family: var(--font-body);
        font-weight: 500;
        font-size: 0.95rem;
        color: var(--text-soft);
        text-decoration: none;
        border-bottom: 2px solid transparent;
        margin-bottom: -2px;
        transition: all 0.15s ease;
        cursor: pointer;
        &:hover {
          color: var(--text-strong);
        }
        &.active {
          color: var(--accent);
          border-bottom-color: var(--accent);
        }
      }
    }
    .assistant-content {
      margin-top: 0.5rem;
    }
  `,
})
export class ExternalAssistantLayoutComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly branchStore = inject(BranchStore);
  private readonly sessionApi = inject(AssistantSessionApiService);
  private readonly sessionStore = inject(AssistantSessionStore);

  protected readonly canViewSessions = computed(() => this.authStore.hasPermission('assistant_session:view'));
  protected readonly canViewAllBranches = computed(() => this.authStore.hasPermission('view:branch:all'));
  protected readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);

  protected readonly sessions = signal<AssistantSession[]>([]);
  protected selectedSessionId: string | null = null;

  protected readonly sessionOptions = computed(() =>
    this.sessions().map((s) => ({ label: `${s.username} (${s.branchName})`, value: s.id }))
  );

  ngOnInit(): void {
    this.loadSessions();
  }

  private loadSessions(): void {
    this.sessionApi.list().subscribe({
      next: (d) => {
        this.sessions.set(d);
        if (d.length > 0 && !this.selectedSessionId) {
          this.selectedSessionId = d[0].id;
          this.sessionStore.setSession(d[0].id);
        }
      },
    });
  }

  protected onSessionChange(sessionId: string): void {
    this.selectedSessionId = sessionId;
    this.sessionStore.setSession(sessionId);
  }
}
