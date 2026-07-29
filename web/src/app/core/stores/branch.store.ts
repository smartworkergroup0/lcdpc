import { Injectable, inject, signal } from '@angular/core';
import { BranchApiService } from '../services/branch-api.service';

export interface BranchOption {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
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

  load(preferredBranchId?: string | null): void {
    if (this._branches().length > 0) {
      if (preferredBranchId && this._branches().some((b) => b.id === preferredBranchId)) {
        this._selectedBranchId.set(preferredBranchId);
      }
      return;
    }

    this._loading.set(true);

    this.branchApi.list().subscribe({
      next: (branchList) => {
        const mapped = branchList.map((b) => ({ id: b.id, name: b.storeName, code: b.code, address: b.address, phone: b.contactPhone }));
        this._branches.set(mapped);

        if (mapped.length > 0) {
          if (preferredBranchId && mapped.some((b) => b.id === preferredBranchId)) {
            this._selectedBranchId.set(preferredBranchId);
          } else {
            this._selectedBranchId.set(mapped[0].id);
          }
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

  selectBranchByCode(code: string): void {
    const branch = this._branches().find((b) => b.code === code);
    if (branch) {
      this._selectedBranchId.set(branch.id);
    }
  }

  refresh(): void {
    this._branches.set([]);
    this.load();
  }
}
