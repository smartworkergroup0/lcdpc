import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { AuthStore } from '../../../../core/auth/auth.store';
import { BranchApiService } from '../../../../core/services/branch-api.service';
import { Branch, BranchSchedule } from '../../../../core/models/branch.model';
import { BranchFormDialogComponent } from './branch-form-dialog.component';

const DAY_NAMES = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];

@Component({
  selector: 'app-branches-section',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, TableModule,
    ToastModule, TooltipModule,
    BranchFormDialogComponent,
  ],
  providers: [MessageService],
  templateUrl: './branches-section.component.html',
})
export class BranchesSectionComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly branchApi = inject(BranchApiService);
  private readonly messageService = inject(MessageService);

  protected readonly canCreate = computed(() => this.authStore.hasPermission('branch:create'));
  protected readonly canUpdate = computed(() => this.authStore.hasPermission('branch:update'));

  protected readonly items = signal<Branch[]>([]);
  protected readonly loading = signal(false);
  protected readonly dialogVisible = signal(false);
  protected readonly editingItem = signal<Branch | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.branchApi.listAdmin().subscribe({
      next: (data) => { this.items.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openCreate(): void {
    this.editingItem.set(null);
    this.dialogVisible.set(true);
  }

  openEdit(item: Branch): void {
    this.editingItem.set(item);
    this.dialogVisible.set(true);
  }

  onDialogClose(saved: boolean): void {
    const wasEditing = this.editingItem() !== null;
    this.dialogVisible.set(false);
    this.editingItem.set(null);
    if (saved) {
      this.messageService.add({ severity: 'success', summary: 'Exito', detail: wasEditing ? 'Sede actualizada' : 'Sede guardada' });
      this.load();
    }
  }

  formatSchedules(schedules: BranchSchedule[]): string {
    if (!schedules || schedules.length === 0) return '-';
    const grouped = new Map<number, string[]>();
    for (const s of schedules) {
      const label = `${s.startTime.substring(0, 5)}-${s.endTime.substring(0, 5)}`;
      if (!grouped.has(s.dayOfWeek)) grouped.set(s.dayOfWeek, []);
      grouped.get(s.dayOfWeek)!.push(label);
    }
    const parts: string[] = [];
    for (const [day, ranges] of grouped) {
      parts.push(`${DAY_NAMES[day]}: ${ranges.join(', ')}`);
    }
    return parts.join(' | ');
  }
}
