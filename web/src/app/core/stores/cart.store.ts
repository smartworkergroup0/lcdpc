import { Injectable, computed, signal, inject } from '@angular/core';
import { SystemConfigStore } from './system-config.store';

const CART_KEY = 'lcdpc_cart';
const CART_TTL_MS = 12 * 60 * 60 * 1000;

export interface CartItem {
  id: string;
  name: string;
  imageUrl: string;
  price: number;
  branchId: string | null;
  quantity: number;
  stockAvailable: number;
  canDecimalStock: boolean;
  unitSymbol: string;
  itemType: 'product' | 'bundle';
  expiresAt?: number;
  items?: { name: string; quantity: number }[];
}

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw) as CartItem[];
    const now = Date.now();
    const hasExpired = items.some(
      (item) => item.expiresAt == null || item.expiresAt <= now,
    );
    if (hasExpired) {
      localStorage.removeItem(CART_KEY);
      return [];
    }
    return items.map((item) => ({
      ...item,
      itemType: item.itemType ?? 'product',
      unitSymbol: item.unitSymbol ?? '',
    }));
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]): void {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly systemConfigStore = inject(SystemConfigStore);

  private readonly _items = signal<CartItem[]>(loadCart());
  private readonly _lastOrderCreatedAt = signal(0);

  readonly items = this._items.asReadonly();
  readonly lastOrderCreatedAt = this._lastOrderCreatedAt.asReadonly();

  readonly totalItems = computed(() => this._items().length);

  readonly totalQuantity = computed(() =>
    this._items().reduce((sum, item) => sum + item.quantity, 0)
  );

  readonly totalPrice = computed(() =>
    this._items().reduce((sum, item) => sum + item.price * item.quantity, 0)
  );

  private capQty(quantity: number, stockAvailable: number): number {
    if (this.systemConfigStore.negativeStock()) return quantity;
    return stockAvailable > 0 ? Math.min(quantity, stockAvailable) : 0;
  }

  private refreshExpiry(items: CartItem[]): CartItem[] {
    const now = Date.now();
    return items.map((item) => ({ ...item, expiresAt: now + CART_TTL_MS }));
  }

  addItem(item: Omit<CartItem, 'quantity'>, quantity: number = 1): void {
    this._items.update((items) => {
      if (items.length > 0 && item.branchId !== null) {
        const currentBranchId = items[0].branchId ?? null;
        if (currentBranchId !== null && currentBranchId !== item.branchId) {
          const capped = this.capQty(quantity, item.stockAvailable);
          const next = this.refreshExpiry(
            capped > 0 ? [{ ...item, quantity: capped } as CartItem] : [],
          );
          saveCart(next);
          return next;
        }
      }
      const existing = items.find((i) => i.id === item.id);
      let next: CartItem[];
      if (existing) {
        const newQty = existing.quantity + quantity;
        const freshStockAvailable = item.stockAvailable;
        const capped = this.capQty(newQty, freshStockAvailable);
        if (capped <= 0) {
          next = items.filter((i) => i.id !== item.id);
        } else {
          next = items.map((i) =>
            i.id === item.id ? { ...i, quantity: capped, stockAvailable: freshStockAvailable } : i
          );
        }
      } else {
        const capped = this.capQty(quantity, item.stockAvailable);
        if (capped <= 0) return items;
        next = [...items, { ...item, quantity: capped }];
      }
      const refreshed = this.refreshExpiry(next);
      saveCart(refreshed);
      return refreshed;
    });
  }

  removeItem(id: string): void {
    this._items.update((items) => {
      const next = items.filter((i) => i.id !== id);
      saveCart(next);
      return next;
    });
  }

  updateQuantity(id: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeItem(id);
      return;
    }
    this._items.update((items) => {
      const next = items.map((i) => {
        if (i.id !== id) return i;
        const capped = this.capQty(quantity, i.stockAvailable);
        return { ...i, quantity: capped };
      });
      const refreshed = this.refreshExpiry(next);
      saveCart(refreshed);
      return refreshed;
    });
  }

  // Los botones +/- siempre usan step de 1 unidad. Para productos con canDecimalStock,
  // el input p-inputNumber permite step de 0.1 via teclado/flechas, pero los botones
  // suman/restan 1. Ej: 0.5 → click "-" → item eliminado (0.5 - 1 = -0.5 ≤ 0).
  increment(id: string): void {
    this._items.update((items) => {
      const next = items.map((i) => {
        if (i.id !== id) return i;
        if (!this.systemConfigStore.negativeStock()) {
          if (i.stockAvailable <= 0) return i;
          return { ...i, quantity: Math.min(i.quantity + 1, i.stockAvailable) };
        }
        return { ...i, quantity: i.quantity + 1 };
      });
      const refreshed = this.refreshExpiry(next);
      saveCart(refreshed);
      return refreshed;
    });
  }

  decrement(id: string): void {
    this._items.update((items) => {
      const next = items.map((i) => {
        if (i.id !== id) return i;
        const min = i.canDecimalStock ? 0.01 : 1;
        const newQty = i.quantity - 1;
        return { ...i, quantity: Math.max(min, newQty) };
      });
      const refreshed = this.refreshExpiry(next);
      saveCart(refreshed);
      return refreshed;
    });
  }

  clear(): void {
    this._items.set([]);
    localStorage.removeItem(CART_KEY);
  }

  notifyOrderCreated(): void {
    this._lastOrderCreatedAt.update((v) => v + 1);
  }

  syncStock(stockMap: Map<string, number>): void {
    this._items.update((items) => {
      let changed = false;
      const next = items
        .map((item) => {
          const freshStock = stockMap.get(item.id);
          if (freshStock == null) return item;
          if (freshStock === item.stockAvailable) return item;
          changed = true;
          if (!this.systemConfigStore.negativeStock() && freshStock <= 0) return null;
          const capped = this.systemConfigStore.negativeStock()
            ? item.quantity
            : Math.min(item.quantity, freshStock);
          return { ...item, stockAvailable: freshStock, quantity: capped };
        })
        .filter(Boolean) as CartItem[];
      if (changed) saveCart(next);
      return changed ? next : items;
    });
  }
}
