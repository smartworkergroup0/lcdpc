import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { BranchStore } from '../../core/stores/branch.store';

@Component({
  selector: 'app-branch-selector-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, SelectModule],
  templateUrl: './branch-selector-dialog.component.html',
  styleUrl: './branch-selector-dialog.component.scss',
})
export class BranchSelectorDialogComponent {
  readonly branchStore = inject(BranchStore);

  visible = signal(false);
  selectedBranchId = signal<string>('');

  open(): void {
    this.selectedBranchId.set(this.branchStore.selectedBranchId());
    this.visible.set(true);
  }

  onBranchChange(branchId: string): void {
    if (branchId) {
      this.branchStore.selectBranch(branchId);
      this.visible.set(false);
    }
  }
}
