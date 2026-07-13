import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingStateService {
  private readonly requestCount = signal(0);

  readonly isLoading = computed(() => this.requestCount() > 0);

  increment(): void {
    this.requestCount.update((count) => count + 1);
  }

  decrement(): void {
    this.requestCount.update((count) => Math.max(0, count - 1));
  }
}
