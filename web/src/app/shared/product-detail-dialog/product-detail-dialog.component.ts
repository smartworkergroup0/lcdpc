import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';

type ProductCard = {
  id: string;
  name: string;
  price: string;
  description: string;
  imageUrl: string;
  alt: string;
  category: string;
  badge?: string;
  featured?: boolean;
  quantity: number;
  stockAvailable: number;
  itemType: 'product' | 'bundle';
  items?: { name: string; quantity: number }[];
};

@Component({
  selector: 'app-product-detail-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, DialogModule, TagModule],
  templateUrl: './product-detail-dialog.component.html',
  styleUrl: './product-detail-dialog.component.scss',
})
export class ProductDetailDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() product: ProductCard | null = null;
  @Input() negativeStock = false;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() addToCart = new EventEmitter<{ id: string; quantity: number }>();

  protected quantity = 1;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.product) {
      this.quantity = this.product.quantity;
    }
    if (changes['product'] && this.product && this.visible) {
      this.quantity = this.product.quantity;
    }
  }

  protected increment(): void {
    if (!this.product) return;
    if (!this.negativeStock && this.product.stockAvailable <= 0) return;
    const max = this.product.stockAvailable;
    this.quantity = this.negativeStock ? this.quantity + 1 : Math.min(this.quantity + 1, max);
  }

  protected decrement(): void {
    this.quantity = Math.max(1, this.quantity - 1);
  }

  protected add(): void {
    if (!this.product) return;
    this.addToCart.emit({ id: this.product.id, quantity: this.quantity });
    this.close();
  }

  protected close(): void {
    this.visibleChange.emit(false);
  }

  protected onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = '/not-found.png';
  }
}
