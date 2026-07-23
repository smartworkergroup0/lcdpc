import { Injectable, computed, inject, signal } from '@angular/core';
import { SystemConfigStore } from './system-config.store';

export type CartPriceOption = { label: string; id: string; amount: number };

export interface SalesCartItem {
  id: string;
  itemType: 'product' | 'bundle';
  name: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  stockAvailable: number;
  stock: number;
  canDecimalStock: boolean;
  priceCategoryId: string | null;
  selectedPriceId: string | null;
  priceOptions: CartPriceOption[];
}

@Injectable({ providedIn: 'root' })
export class SalesCartStore {
  private readonly systemConfigStore = inject(SystemConfigStore);

  private readonly _items = signal<SalesCartItem[]>([]);
  private readonly _personId = signal<string | null>(null);
  private readonly _clientUserId = signal<string | null>(null);
  private readonly _clientName = signal<string | null>(null);
  private readonly _clientDocument = signal<string | null>(null);

  readonly items = this._items.asReadonly();
  readonly personId = this._personId.asReadonly();
  readonly clientUserId = this._clientUserId.asReadonly();
  readonly clientName = this._clientName.asReadonly();
  readonly clientDocument = this._clientDocument.asReadonly();

  readonly totalItems = computed(() =>
    this._items().reduce((sum, item) => sum + item.quantity, 0)
  );
  readonly totalPrice = computed(() =>
    this._items().reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  );
  readonly isEmpty = computed(() => this._items().length === 0);
  readonly hasClient = computed(() =>
    this._personId() !== null || this._clientUserId() !== null
  );

  addItem(item: SalesCartItem): boolean {
    if (!this.systemConfigStore.negativeStock()) {
      if (item.stockAvailable <= 0) return false;
    }

    this._items.update(items => {
      const existing = items.find(i => i.id === item.id);
      if (existing) {
        const newQty = existing.quantity + item.quantity;
        if (!this.systemConfigStore.negativeStock() && newQty > item.stockAvailable) {
          return items;
        }
        return items.map(i =>
          i.id === item.id ? { ...i, quantity: newQty } : i
        );
      }
      return [...items, item];
    });
    return true;
  }

  incrementItem(id: string): boolean {
    let success = false;
    this._items.update(items => {
      return items.map(i => {
        if (i.id !== id) return i;
        if (!this.systemConfigStore.negativeStock()) {
          if (i.quantity >= i.stockAvailable) return i;
        }
        success = true;
        return { ...i, quantity: i.quantity + 1 };
      });
    });
    return success;
  }

  decrementItem(id: string): void {
    this._items.update(items => {
      const next = items
        .map(i => {
          if (i.id !== id) return i;
          const newQty = i.quantity - 1;
          return newQty <= 0 ? null : { ...i, quantity: newQty };
        })
        .filter(Boolean) as SalesCartItem[];
      return next;
    });
  }

  removeItem(id: string): void {
    this._items.update(items => items.filter(i => i.id !== id));
  }

  updateItemPrice(id: string, unitPrice: number, selectedPriceId: string, priceCategoryId: string | null): void {
    this._items.update(items =>
      items.map(i =>
        i.id === id ? { ...i, unitPrice, selectedPriceId, priceCategoryId } : i
      )
    );
  }

  updateQuantityItem(id: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeItem(id);
      return;
    }
    this._items.update(items =>
      items.map(i => i.id === id ? { ...i, quantity } : i)
    );
  }

  setClient(personId: string | null, clientUserId: string | null, name: string, document: string): void {
    this._personId.set(personId);
    this._clientUserId.set(clientUserId);
    this._clientName.set(name);
    this._clientDocument.set(document);
  }

  clearClient(): void {
    this._personId.set(null);
    this._clientUserId.set(null);
    this._clientName.set(null);
    this._clientDocument.set(null);
  }

  clear(): void {
    this._items.set([]);
    this.clearClient();
  }
}
