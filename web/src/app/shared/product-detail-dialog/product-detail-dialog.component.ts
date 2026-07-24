import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';

type PriceOption = { label: string; id: string; amount: number };

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
  canDecimalStock: boolean;
  unitSymbol: string;
  itemType: 'product' | 'bundle';
  items?: { name: string; quantity: number }[];
  priceOptions?: PriceOption[];
  selectedPriceId?: string | null;
};

@Component({
  selector: 'app-product-detail-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, DialogModule, TagModule, SelectModule, InputNumberModule],
  templateUrl: './product-detail-dialog.component.html',
  styleUrl: './product-detail-dialog.component.scss',
})
export class ProductDetailDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() product: ProductCard | null = null;
  @Input() negativeStock = false;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() addToCart = new EventEmitter<{ id: string; quantity: number; selectedPriceId: string | null }>();

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
    const newQty = Math.round((this.quantity + 1) * 100) / 100;
    this.quantity = this.negativeStock ? newQty : Math.min(newQty, max);
  }

  protected decrement(): void {
    const min = this.product?.canDecimalStock ? 0.1 : 1;
    this.quantity = Math.max(min, Math.round((this.quantity - 1) * 100) / 100);
  }

  protected onQuantityInput(value: number | null): void {
    if (value === null || value === undefined) return;
    const min = this.product?.canDecimalStock ? 0.1 : 1;
    const max = this.negativeStock ? Infinity : (this.product?.stockAvailable ?? Infinity);
    this.quantity = Math.max(min, Math.min(value, max));
  }

  protected onPriceChange(id: string): void {
    if (!this.product || !this.product.priceOptions) return;
    const option = this.product.priceOptions.find(o => o.id === id);
    if (option) {
      this.product.selectedPriceId = id;
      this.product.price = `$${option.amount.toFixed(2)}`;
    }
  }

  protected add(): void {
    if (!this.product) return;
    this.addToCart.emit({ id: this.product.id, quantity: this.quantity, selectedPriceId: this.product.selectedPriceId ?? null });
    this.close();
  }

  protected close(): void {
    this.visibleChange.emit(false);
  }

  protected onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = '/not-found.png';
  }
}
