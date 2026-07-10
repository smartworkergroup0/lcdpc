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
  private loaded = false;

  readonly branches = this._branches.asReadonly();
  readonly selectedBranchId = this._selectedBranchId.asReadonly();

  load(): void {
    if (this.loaded) return;
    this.loaded = true;

    this.branchApi.list().subscribe({
      next: (branchList) => {
        const mapped = branchList.map((b) => ({ id: b.id, name: b.storeName }));
        this._branches.set(mapped);
        if (mapped.length > 0 && !this._selectedBranchId()) {
          this._selectedBranchId.set(mapped[0].id);
        }
      },
    });
  }

  selectBranch(branchId: string): void {
    if (branchId) {
      this._selectedBranchId.set(branchId);
    }
  }

  refresh(): void {
    this.loaded = false;
    this.load();
  }
}
