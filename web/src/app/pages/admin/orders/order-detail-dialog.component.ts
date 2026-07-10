import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnChanges, Output, signal, SimpleChanges } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { Order, ORDER_STATUS_LABELS, ORDER_STATUS_SEVERITY, ORDER_EDITABLE_STATUSES, StatusHistoryEntry } from '../../../core/models/order.model';
import { OrderApiService } from '../../../core/services/order-api.service';

@Component({
  selector: 'app-order-detail-dialog',
  standalone: true,
  imports: [CommonModule, DialogModule, TagModule, ButtonModule, TooltipModule],
  templateUrl: './order-detail-dialog.component.html',
  styleUrl: './order-detail-dialog.component.scss'
})
export class OrderDetailDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() order: Order | null = null;
  @Input() branches: { id: string; name: string }[] = [];

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() viewItems = new EventEmitter<void>();

  private readonly orderApi = inject(OrderApiService);

  protected readonly history = signal<StatusHistoryEntry[]>([]);

  protected get isEditable(): boolean {
    return !!ORDER_EDITABLE_STATUSES[this.order?.status ?? ''];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.order) {
      this.orderApi.getHistory(this.order.id).subscribe({
        next: (h) => this.history.set(h),
      });
    }
  }

  getBranchName(branchId: string): string {
    return this.branches.find((b) => b.id === branchId)?.name ?? branchId.slice(0, 8);
  }

  orderStatusLabel(status: string): string {
    return ORDER_STATUS_LABELS[status] ?? status;
  }

  orderStatusSeverity(status: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' {
    return ORDER_STATUS_SEVERITY[status] ?? 'info';
  }
}
