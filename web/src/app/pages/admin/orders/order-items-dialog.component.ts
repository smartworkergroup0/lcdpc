import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnChanges, Output, signal, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { FloatLabelModule } from 'primeng/floatlabel';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { OrderApiService } from '../../../core/services/order-api.service';
import { ProductApiService } from '../../../core/services/product-api.service';
import { BundleApiService } from '../../../core/services/bundle-api.service';
import { PriceApiService } from '../../../core/services/price-api.service';
import { PriceCategoryApiService } from '../../../core/services/price-category-api.service';
import { MeasurementUnitApiService } from '../../../core/services/measurement-unit-api.service';
import { SystemConfigStore } from '../../../core/stores/system-config.store';
import { MeasurementUnitClassificationStore } from '../../../core/stores/measurement-unit-classification.store';
import { MeasurementUnitStore } from '../../../core/stores/measurement-unit.store';
import { Product } from '../../../core/models/product.model';
import { Bundle } from '../../../core/models/bundle.model';
import { MeasurementUnit } from '../../../core/models/measurement-unit.model';
import { PriceCategory } from '../../../core/models/price-category.model';
import { ProductBranchPrice } from '../../../core/models/price.model';
import {
  Order,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_SEVERITY,
  ORDER_EDITABLE_STATUSES,
  UpdateOrderRequest,
} from '../../../core/models/order.model';

interface PriceOption {
  label: string;
  id: string;
  amount: number;
}

interface EditableOrderItem {
  id?: string;
  itemType: 'product' | 'bundle';
  productId: string | null;
  bundleId: string | null;
  quantity: number;
  originalQuantity: number;
  unitPrice: number;
  subtotal: number;
  priceOptions: PriceOption[];
  selectedPriceId: string | null;
  isNew?: boolean;
  isRemoved?: boolean;
}

@Component({
  selector: 'app-order-items-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, InputNumberModule, SelectModule, FloatLabelModule,
    TagModule, ToastModule, TooltipModule,
  ],
  providers: [MessageService],
  templateUrl: './order-items-dialog.component.html',
  styleUrl: './order-items-dialog.component.scss'
})
export class OrderItemsDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() order: Order | null = null;
  @Input() branches: { id: string; name: string }[] = [];

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();

  private readonly orderApi = inject(OrderApiService);
  private readonly productApi = inject(ProductApiService);
  private readonly bundleApi = inject(BundleApiService);
  private readonly priceApi = inject(PriceApiService);
  private readonly priceCategoryApi = inject(PriceCategoryApiService);
  private readonly unitApi = inject(MeasurementUnitApiService);
  private readonly classificationStore = inject(MeasurementUnitClassificationStore);
  private readonly unitStore = inject(MeasurementUnitStore);
  private readonly systemConfigStore = inject(SystemConfigStore);
  private readonly messageService = inject(MessageService);

  protected readonly saving = signal(false);
  protected readonly products = signal<Product[]>([]);
  protected readonly bundles = signal<Bundle[]>([]);
  protected readonly allUnits = signal<MeasurementUnit[]>([]);
  protected readonly priceCategories = signal<PriceCategory[]>([]);
  protected items: EditableOrderItem[] = [];
  protected notes = '';
  protected submitted = false;

  protected get isEditable(): boolean {
    return !!ORDER_EDITABLE_STATUSES[this.order?.status ?? ''];
  }

  protected get visibleItems(): EditableOrderItem[] {
    return this.items.filter((i) => !i.isRemoved);
  }

  protected get visibleProductItems(): EditableOrderItem[] {
    return this.visibleItems.filter((i) => i.itemType === 'product');
  }

  protected get visibleBundleItems(): EditableOrderItem[] {
    return this.visibleItems.filter((i) => i.itemType === 'bundle');
  }

  protected get publishedBundles(): Bundle[] {
    const activeIds = new Set(this.visibleBundleItems.map((i) => i.bundleId).filter(Boolean));
    const published = this.bundles().filter((b) => b.status === 'Active');
    const existing = this.bundles().filter((b) => activeIds.has(b.bundleId));
    const merged = new Map([...published, ...existing].map((b) => [b.bundleId, b]));
    return [...merged.values()];
  }

  protected get total(): number {
    return this.visibleItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  }

  protected get totalItems(): number {
    return this.visibleItems.reduce((sum, item) => sum + item.quantity, 0);
  }

  protected get productTotal(): number {
    return this.visibleProductItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  }

  protected get productTotalItems(): number {
    return this.visibleProductItems.reduce((sum, item) => sum + item.quantity, 0);
  }

  protected get bundleTotal(): number {
    return this.visibleBundleItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  }

  protected get bundleTotalItems(): number {
    return this.visibleBundleItems.reduce((sum, item) => sum + item.quantity, 0);
  }

  protected get hasStockIssues(): boolean {
    if (this.systemConfigStore.negativeStock()) return false;
    return this.visibleItems.some((item) => this.checkStockIssue(item));
  }

  protected get hasDuplicates(): boolean {
    const seen = new Set<string>();
    for (const item of this.visibleItems) {
      const key = item.itemType === 'bundle' ? `bundle:${item.bundleId}` : `product:${item.productId}`;
      if (key === 'product:null' || key === 'bundle:null') continue;
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.order) {
      this.submitted = false;
      this.notes = this.order.notes ?? '';
      this.items = [];

      this.classificationStore.load();
      this.unitStore.load();
      this.unitApi.list().subscribe({
        next: (units) => this.allUnits.set(units),
      });

      this.productApi.list({ branch_id: this.order.branchId, limit: 100 }).subscribe({
        next: (res) => this.products.set(res.items.filter((p) => p.isActive)),
      });

      this.bundleApi.list({ limit: 100 }).subscribe({
        next: (res) => {
          const loaded = new Map(res.items.map((b) => [b.bundleId, b]));
          this.bundles.set(res.items);

          const bundleIds = (this.order?.items ?? [])
            .filter((i) => i.itemType === 'bundle' && i.bundleId && !loaded.has(i.bundleId))
            .map((i) => i.bundleId!);

          for (const bundleId of bundleIds) {
            this.bundleApi.getById(bundleId).subscribe({
              next: (bundle) => {
                this.bundles.update((list) => [...list, bundle]);
              },
            });
          }
        },
      });

      this.priceCategoryApi.list().subscribe({
        next: (cats) => this.priceCategories.set(cats),
      });

      if (this.order.items && this.order.items.length > 0) {
        for (const item of this.order.items) {
          const itemType = (item.itemType === 'bundle' ? 'bundle' : 'product') as 'product' | 'bundle';
          const editable: EditableOrderItem = {
            id: item.id,
            itemType,
            productId: item.productId ?? null,
            bundleId: item.bundleId ?? null,
            quantity: item.quantity,
            originalQuantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            priceOptions: [],
            selectedPriceId: null,
          };
          this.items.push(editable);
          if (itemType === 'product' && editable.productId) {
            this.loadPricesForItem(this.items.length - 1, editable.productId);
          }
        }
      }
    }
  }

  private loadPricesForItem(index: number, productId: string, autoSelectFirst = false): void {
    this.priceApi.listByProductId(productId).subscribe({
      next: (prices) => {
        if (index < this.items.length) {
          const opts = this.formatPriceOptions(prices);
          this.items[index].priceOptions = opts;
          if (autoSelectFirst || this.items[index].unitPrice === 0) {
            const first = opts[0];
            if (first) {
              this.items[index].unitPrice = first.amount;
              this.items[index].selectedPriceId = first.id;
            }
          } else {
            const match = opts.find((o) => o.amount === this.items[index].unitPrice);
            this.items[index].selectedPriceId = match?.id ?? opts[0]?.id ?? null;
            if (!match && opts.length > 0) {
              this.items[index].unitPrice = opts[0].amount;
              this.items[index].selectedPriceId = opts[0].id;
            }
          }
        }
      },
    });
  }

  private formatPriceOptions(prices: ProductBranchPrice[]): PriceOption[] {
    return prices.map((p) => {
      const cat = this.priceCategories().find((c) => c.id === p.priceCategoryId);
      const name = cat?.name ?? 'Precio base';
      return { label: `${name} — $${p.amount.toFixed(2)}`, id: p.id, amount: p.amount };
    });
  }

  protected addProductItem(): void {
    this.items.push({
      itemType: 'product',
      productId: null,
      bundleId: null,
      quantity: 1,
      originalQuantity: 0,
      unitPrice: 0,
      subtotal: 0,
      priceOptions: [],
      selectedPriceId: null,
      isNew: true,
    });
  }

  protected addBundleItem(): void {
    this.items.push({
      itemType: 'bundle',
      productId: null,
      bundleId: null,
      quantity: 1,
      originalQuantity: 0,
      unitPrice: 0,
      subtotal: 0,
      priceOptions: [],
      selectedPriceId: null,
      isNew: true,
    });
  }

  protected removeItem(item: EditableOrderItem): void {
    const realIndex = this.items.indexOf(item);
    if (realIndex === -1) return;
    if (item.id) {
      this.items[realIndex].isRemoved = true;
    } else {
      this.items.splice(realIndex, 1);
    }
  }

  protected onProductSelect(item: EditableOrderItem): void {
    const realIndex = this.items.indexOf(item);
    if (!item.productId) return;

    this.items[realIndex].itemType = 'product';
    this.items[realIndex].bundleId = null;
    this.items[realIndex].unitPrice = 0;
    this.items[realIndex].priceOptions = [];
    this.items[realIndex].selectedPriceId = null;
    this.loadPricesForItem(realIndex, item.productId, true);
  }

  protected onBundleSelect(item: EditableOrderItem): void {
    const realIndex = this.items.indexOf(item);
    if (!item.bundleId) return;

    this.items[realIndex].itemType = 'bundle';
    this.items[realIndex].productId = null;
    this.items[realIndex].priceOptions = [];
    this.items[realIndex].selectedPriceId = null;
    const bundle = this.bundles().find((b) => b.bundleId === item.bundleId);
    if (bundle) {
      this.items[realIndex].unitPrice = bundle.prices?.[0]?.amount ?? 0;
    }
  }

  protected isDuplicateItem(item: EditableOrderItem): boolean {
    const key = item.itemType === 'bundle' ? `bundle:${item.bundleId}` : `product:${item.productId}`;
    if (key === 'product:null' || key === 'bundle:null') return false;
    let count = 0;
    for (const i of this.visibleItems) {
      const k = i.itemType === 'bundle' ? `bundle:${i.bundleId}` : `product:${i.productId}`;
      if (k === key) count++;
    }
    return count > 1;
  }

  protected isOverStock(item: EditableOrderItem): boolean {
    if (this.systemConfigStore.negativeStock()) return false;
    return this.checkStockIssue(item);
  }

  protected getItemMaxFractionDigits(item: EditableOrderItem): number {
    if (item.itemType === 'bundle') return 0;
    if (!item.productId) return 0;
    const product = this.products().find((p) => p.productId === item.productId);
    if (!product?.baseUnitId) return 0;
    const unit = this.allUnits().find((u) => u.id === product.baseUnitId);
    if (!unit?.classificationId) return 0;
    return this.classificationStore.canDecimalStock(unit.classificationId) ? 3 : 0;
  }

  protected onPriceOptionSelect(item: EditableOrderItem, id: string): void {
    const realIndex = this.items.indexOf(item);
    if (realIndex >= 0) {
      this.items[realIndex].selectedPriceId = id;
      const option = item.priceOptions.find((o) => o.id === id);
      if (option) {
        this.items[realIndex].unitPrice = option.amount;
      }
    }
  }

  protected getItemStockInfo(item: EditableOrderItem): string {
    if (item.itemType === 'bundle') {
      if (!item.bundleId) return '';
      const bundle = this.bundles().find((b) => b.bundleId === item.bundleId);
      if (!bundle) return '';
      const additional = item.quantity - item.originalQuantity;
      const available = bundle.stock - bundle.stockBlocked;
      if (additional > 0) {
        return `Disponible: ${available} (se tomara ${additional} adicionales)`;
      }
      if (additional < 0) {
        return `Disponible: ${available} (libera ${-additional})`;
      }
      return `Disponible: ${available}`;
    }
    if (!item.productId) return '';
    const product = this.products().find((p) => p.productId === item.productId);
    if (!product) return '';
    const additional = item.quantity - item.originalQuantity;
    const available = product.stock - product.stockBlocked;
    const sym = this.unitStore.getMeasurementUnitSymbol(product.baseUnitId);
    if (additional > 0) {
      return `Disponible: ${available} ${sym} (se tomara ${additional} adicionales)`;
    }
    if (additional < 0) {
      return `Disponible: ${available} ${sym} (libera ${-additional})`;
    }
    return `Disponible: ${available} ${sym}`;
  }

  protected getItemName(item: EditableOrderItem): string {
    if (item.itemType === 'bundle') {
      const bundle = this.bundles().find((b) => b.bundleId === item.bundleId);
      return bundle?.name ?? item.bundleId?.slice(0, 8) ?? '';
    }
    return this.products().find((p) => p.productId === item.productId)?.name ?? item.productId?.slice(0, 8) ?? '';
  }

  protected orderStatusLabel(status: string): string {
    return ORDER_STATUS_LABELS[status] ?? status;
  }

  protected orderStatusSeverity(status: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' {
    return ORDER_STATUS_SEVERITY[status] ?? 'info';
  }

  protected save(): void {
    this.submitted = true;
    if (!this.order) return;

    const activeItems = this.visibleItems;
    if (activeItems.length === 0) return;
    if (activeItems.some((i) => (i.itemType === 'bundle' ? !i.bundleId : !i.productId) || i.quantity <= 0)) return;
    if (this.hasDuplicates) return;
    if (this.hasStockIssues) return;

    this.saving.set(true);

    const req: UpdateOrderRequest = {
      notes: this.notes,
      items: activeItems.map((i) => ({
        item_type: i.itemType,
        product_id: i.productId ?? undefined,
        bundle_id: i.bundleId ?? undefined,
        quantity: i.quantity,
        unit_price: i.unitPrice,
      })),
    };

    this.orderApi.update(this.order.id, req).subscribe({
      next: () => {
        this.saving.set(false);
        this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Orden actualizada' });
        this.saved.emit();
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message ?? 'No se pudo actualizar la orden';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: msg });
      },
    });
  }

  protected goBack(): void {
    this.visibleChange.emit(false);
    this.back.emit();
  }

  protected close(): void {
    this.visibleChange.emit(false);
  }

  private checkStockIssue(item: EditableOrderItem): boolean {
    if (item.itemType === 'bundle') {
      if (!item.bundleId) return false;
      const bundle = this.bundles().find((b) => b.bundleId === item.bundleId);
      if (!bundle) return false;
      const additional = item.quantity - item.originalQuantity;
      const available = bundle.stock - bundle.stockBlocked;
      const effectiveBlocked = bundle.stockBlocked - item.originalQuantity + item.quantity;
      return effectiveBlocked > bundle.stock || additional > available;
    }
    if (!item.productId) return false;
    const product = this.products().find((p) => p.productId === item.productId);
    if (!product) return false;
    const additional = item.quantity - item.originalQuantity;
    const available = product.stock - product.stockBlocked;
    const effectiveBlocked = product.stockBlocked - item.originalQuantity + item.quantity;
    return effectiveBlocked > product.stock || additional > available;
  }
}
