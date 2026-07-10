import { inject } from '@angular/core';
import { SystemConfigStore } from './system-config.store';

export function initializeSystemConfig(): () => void {
  return () => {
    const store = inject(SystemConfigStore);
    store.load();
  };
}
