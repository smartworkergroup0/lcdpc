import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AssistantSessionStore {
  readonly selectedSessionId = signal<string | null>(null);

  setSession(id: string | null): void {
    this.selectedSessionId.set(id);
  }
}
