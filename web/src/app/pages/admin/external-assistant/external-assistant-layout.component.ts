import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-external-assistant-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="assistant-layout">
      <div class="page-header">
        <h1>Asistente Virtual</h1>
      </div>
      <nav class="assistant-nav">
        <a routerLink="/admin/external-assistant/leads" routerLinkActive="active">Leads</a>
        <a routerLink="/admin/external-assistant/orders" routerLinkActive="active">Ordenes</a>
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
      h1 {
        font-family: var(--font-display);
        font-size: 1.75rem;
        color: var(--text-strong);
        margin: 0;
      }
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
export class ExternalAssistantLayoutComponent {}
