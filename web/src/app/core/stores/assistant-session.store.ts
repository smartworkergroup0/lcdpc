import { computed, Injectable, signal } from '@angular/core';
import { AssistantSession } from '../models/assistant-session.model';

@Injectable({ providedIn: 'root' })
export class AssistantSessionStore {
  readonly selectedSession = signal<AssistantSession | null>(null);
  readonly selectedSessionBranchId = computed(() => this.selectedSession()?.branchId ?? null);

  setSession(session: AssistantSession | null): void {
    this.selectedSession.set(session);
  }
}
