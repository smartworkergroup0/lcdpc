import { CommonModule } from '@angular/common';
import { Component, computed, EventEmitter, Input, OnChanges, Output, signal, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';

type PriceOption = { label: string; id: string; amount: number };

export type ConversionUnitOption = {
  unitId: string;
  unitName: string;
  unitSymbol: string | null;
  effectiveAmount: number;
};

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
  @Input() conversionFactors: ConversionUnitOption[] = [];

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() addToCart = new EventEmitter<{ id: string; quantity: number; selectedPriceId: string | null }>();

  protected quantity = 1;
  protected readonly selectedUnitIndex = signal(0);
  protected readonly validationMessage = signal<string | null>(null);

  protected readonly unitOptions = computed(() =>
    this.conversionFactors.map((f, i) => ({
      label: f.unitSymbol ? `${f.unitName} (${f.unitSymbol})` : f.unitName,
      value: i,
    }))
  );

  protected readonly selectedUnit = computed(() =>
    this.conversionFactors[this.selectedUnitIndex()] ?? null
  );

  protected readonly effectiveStock = computed(() => {
    const unit = this.selectedUnit();
    if (!unit || !this.product) return this.product?.stockAvailable ?? 0;
    if (unit.effectiveAmount <= 0) return 0;
    return this.product.stockAvailable / unit.effectiveAmount;
  });

  protected readonly effectiveSymbol = computed(() => {
    const unit = this.selectedUnit();
    return unit?.unitSymbol ?? this.product?.unitSymbol ?? '';
  });

  protected readonly canInputDecimal = computed(() => {
    const unit = this.selectedUnit();
    if (unit && unit.effectiveAmount !== 1) return true;
    return this.product?.canDecimalStock ?? false;
  });

  protected get convertedQuantity(): number | null {
    const unit = this.selectedUnit();
    if (!unit || !this.product) return null;
    if (unit.effectiveAmount === 1) return null;
    const raw = this.quantity * unit.effectiveAmount;
    return Math.round(raw * 1000) / 1000;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['conversionFactors']) {
      this.selectedUnitIndex.set(0);
    }
    if (changes['visible'] && this.visible && this.product) {
      this.quantity = this.product.quantity;
      this.selectedUnitIndex.set(0);
    }
    if (changes['product'] && this.product && this.visible) {
      this.quantity = this.product.quantity;
      this.selectedUnitIndex.set(0);
    }
  }

  protected onUnitChange(index: number): void {
    this.selectedUnitIndex.set(index);
    this.quantity = 1;
    this.validationMessage.set(null);
  }

  protected increment(): void {
    if (!this.product) return;
    if (!this.negativeStock && this.effectiveStock() <= 0) return;
    const max = this.effectiveStock();
    const newQty = Math.round((this.quantity + 1) * 100) / 100;
    this.quantity = this.negativeStock ? newQty : Math.min(newQty, max);
  }

  protected decrement(): void {
    const min = this.canInputDecimal() ? 0.1 : 1;
    this.quantity = Math.max(min, Math.round((this.quantity - 1) * 100) / 100);
  }

  protected onQuantityInput(value: number | null): void {
    if (value === null || value === undefined) return;
    const min = this.canInputDecimal() ? 0.1 : 1;
    const max = this.negativeStock ? Infinity : this.effectiveStock();
    this.quantity = Math.max(min, Math.min(value, max));
    this.validationMessage.set(null);
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
    const unit = this.selectedUnit();
    const raw = unit ? this.quantity * unit.effectiveAmount : this.quantity;
    const baseQuantity = Math.round(raw * 1000) / 1000;
    if (baseQuantity < 0.01) {
      const unitName = unit?.unitName ?? this.product.unitSymbol ?? 'unidad';
      this.validationMessage.set(
        `La cantidad ingresada equivale a ${baseQuantity} unidades base, el mínimo permitido es 0.01. Ingrese una mayor cantidad en ${unitName}.`
      );
      return;
    }
    this.addToCart.emit({ id: this.product.id, quantity: baseQuantity, selectedPriceId: this.product.selectedPriceId ?? null });
    this.close();
  }

  protected close(): void {
    this.visibleChange.emit(false);
  }

  protected onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = '/not-found.png';
  }
}
