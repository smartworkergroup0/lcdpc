import { Injectable, inject, signal } from '@angular/core';
import { BranchApiService } from '../services/branch-api.service';

export interface BranchOption {
  id: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class BranchStore {
  private readonly branchApi = inject(BranchApiService);

  private readonly _branches = signal<BranchOption[]>([]);
  private readonly _selectedBranchId = signal<string>('');
  private readonly _loading = signal(false);

  readonly branches = this._branches.asReadonly();
  readonly selectedBranchId = this._selectedBranchId.asReadonly();
  readonly loading = this._loading.asReadonly();

  load(): void {
    if (this._branches().length > 0) return;
    this._loading.set(true);

    this.branchApi.list().subscribe({
      next: (branchList) => {
        const mapped = branchList.map((b) => ({ id: b.id, name: b.storeName }));
        this._branches.set(mapped);
        if (mapped.length > 0 && !this._selectedBranchId()) {
          this._selectedBranchId.set(mapped[0].id);
        }
        this._loading.set(false);
      },
      error: () => {
        this._loading.set(false);
      },
    });
  }

  selectBranch(branchId: string): void {
    if (branchId) {
      this._selectedBranchId.set(branchId);
    }
  }

  refresh(): void {
    this._branches.set([]);
    this.load();
  }
}
