import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, forkJoin, firstValueFrom, Observable } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputGroupModule } from 'primeng/inputgroup';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { FloatLabelModule } from 'primeng/floatlabel';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthStore } from '../../../core/auth/auth.store';
import { SalesCartStore, SalesCartItem, CartPriceOption } from '../../../core/stores/sales-cart.store';
import { SystemConfigStore } from '../../../core/stores/system-config.store';
import { CategoryStore } from '../../../core/stores/category.store';
import { ProductApiService } from '../../../core/services/product-api.service';
import { BundleApiService } from '../../../core/services/bundle-api.service';
import { PriceApiService } from '../../../core/services/price-api.service';
import { PriceCategoryApiService } from '../../../core/services/price-category-api.service';
import { ClientApiService } from '../../../core/services/client-api.service';
import { OrderApiService } from '../../../core/services/order-api.service';
import { BranchApiService } from '../../../core/services/branch-api.service';
import { ConversionFactorApiService } from '../../../core/services/conversion-factor-api.service';
import { ConversionUnitOption } from '../../../shared/product-detail-dialog/product-detail-dialog.component';
import { Product } from '../../../core/models/product.model';
import { Bundle } from '../../../core/models/bundle.model';
import { ConversionFactor } from '../../../core/models/conversion-factor.model';
import { PriceCategory } from '../../../core/models/price-category.model';
import { ProductBranchPrice } from '../../../core/models/price.model';
import { CreateOrderRequest } from '../../../core/models/order.model';
import { DOCUMENT_TYPE_OPTIONS } from '../../../core/models/document-type.model';
import { Person } from '../../../core/models/person.model';
import { ClientFormDialogComponent } from '../orders/client-form-dialog.component';
import { ProductDetailDialogComponent } from '../../../shared/product-detail-dialog/product-detail-dialog.component';
import { MeasurementUnitStore } from '../../../core/stores/measurement-unit.store';
import { MeasurementUnitClassificationStore } from '../../../core/stores/measurement-unit-classification.store';

type CatalogItem = (Product & { itemType: 'product'; id: string }) | (Bundle & { itemType: 'bundle'; id: string });

export type PriceOption = { label: string; id: string; amount: number };

type DetailProductCard = {
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
  priceOptions: PriceOption[];
  selectedPriceId: string | null;
  conversionUnits: ConversionUnitOption[];
};

@Component({
  selector: 'app-sales-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, InputTextModule,
    InputGroupModule, SelectModule, ToastModule, TooltipModule,
    ConfirmDialogModule, DialogModule, InputNumberModule,
    TagModule, FloatLabelModule, ClientFormDialogComponent,
    ProductDetailDialogComponent,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './sales-page.component.html',
  styleUrl: './sales-page.component.scss',
})
export class SalesPageComponent implements OnInit {
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('productGrid') productGrid!: ElementRef<HTMLDivElement>;

  private readonly authStore = inject(AuthStore);
  readonly salesCart = inject(SalesCartStore);
  readonly systemConfigStore = inject(SystemConfigStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly productApi = inject(ProductApiService);
  private readonly bundleApi = inject(BundleApiService);
  private readonly priceApi = inject(PriceApiService);
  private readonly priceCategoryApi = inject(PriceCategoryApiService);
  private readonly clientApi = inject(ClientApiService);
  private readonly orderApi = inject(OrderApiService);
  private readonly branchApi = inject(BranchApiService);
  private readonly conversionApi = inject(ConversionFactorApiService);
  private readonly unitStore = inject(MeasurementUnitStore);
  private readonly classificationStore = inject(MeasurementUnitClassificationStore);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly router = inject(Router);

  protected readonly canCreate = computed(() => this.authStore.hasPermission('sales:create'));
  protected readonly canViewAllBranches = computed(() => this.authStore.hasPermission('view:branch:all'));
  protected readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);

  protected readonly branches = signal<{ id: string; name: string }[]>([]);
  protected readonly selectedBranchId = signal<string | null>(null);
  protected readonly userBranchName = signal<string | null>(null);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly searchingClient = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly allProducts = signal<Product[]>([]);
  protected readonly allBundles = signal<Bundle[]>([]);
  protected readonly productsTotalCount = signal(Infinity);
  protected readonly bundlesTotalCount = signal(Infinity);
  protected readonly productsOffset = signal(0);
  protected readonly bundlesOffset = signal(0);
  protected readonly priceCategories = signal<PriceCategory[]>([]);
  protected readonly selectedCategoryId = signal<string | null>(null);
  protected readonly searchQuery = signal('');
  protected readonly DOCUMENT_TYPE_OPTIONS = DOCUMENT_TYPE_OPTIONS;

  protected readonly documentType = signal('V');
  protected readonly documentNumber = signal('');
  protected readonly personNotFound = signal(false);
  protected readonly showClientDialog = signal(false);

  protected readonly detailVisible = signal(false);
  protected readonly detailProduct = signal<DetailProductCard | null>(null);

  protected readonly pageSize = 50;
  private currentSearch = '';
  private currentCategoryId: string | null = null;
  private readonly searchSubject = new Subject<string>();

  protected readonly categories = computed(() => this.categoryStore.categoryOptions());

  protected readonly filteredCatalogItems = computed(() => [
    ...this.allProducts().map(p => ({ ...p, itemType: 'product' as const, id: p.productId })),
    ...this.allBundles().map(b => ({ ...b, itemType: 'bundle' as const, id: b.bundleId })),
  ]);

  protected readonly hasMoreProducts = computed(() => this.productsOffset() < this.productsTotalCount());
  protected readonly hasMoreBundles = computed(() => this.bundlesOffset() < this.bundlesTotalCount());
  protected readonly hasMoreItems = computed(() => this.hasMoreProducts() || this.hasMoreBundles());

  constructor() {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
    ).subscribe(query => {
      this.searchQuery.set(query);
      this.currentSearch = query;
      this.resetAndReload();
    });
  }

  ngOnInit(): void {
    this.categoryStore.load();
    this.unitStore.load();
    this.classificationStore.load();

    this.branchApi.listAdmin().subscribe({
      next: (branches) => {
        const mapped = branches.map(b => ({ id: b.id, name: b.storeName }));
        this.branches.set(mapped);

        if (this.canViewAllBranches()) {
          this.selectedBranchId.set(this.userBranchId() ?? (mapped.length > 0 ? mapped[0].id : null));
        } else {
          this.selectedBranchId.set(this.userBranchId());
          if (mapped.length > 0) {
            this.userBranchName.set(mapped[0].name);
          }
        }

        if (!this.selectedBranchId()) {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo determinar la sucursal' });
          return;
        }

        this.priceCategoryApi.list().subscribe({
          next: (res) => this.priceCategories.set(res),
        });
        this.loadBatch();
      },
      error: () => {
        if (!this.canViewAllBranches() && !this.userBranchId()) {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo determinar la sucursal' });
          return;
        }
        this.selectedBranchId.set(this.userBranchId());
        this.priceCategoryApi.list().subscribe({
          next: (res) => this.priceCategories.set(res),
        });
        this.loadBatch();
      },
    });
  }

  onSearchInput(value: string): void {
    this.searchSubject.next(value);
  }

  onSearchKeyup(event: KeyboardEvent): void {
    const input = (event.target as HTMLInputElement).value.trim();
    if (event.key === 'Enter' && input) {
      event.preventDefault();
      this.tryBarcodeScan(input);
      return;
    }
  }

  onSearchButton(): void {
    const value = this.searchInput?.nativeElement.value.trim();
    if (value) {
      this.tryBarcodeScan(value);
    }
  }

  private tryBarcodeScan(code: string): void {
    const normalized = code.trim().toLowerCase();

    const product = this.allProducts().find(p => p.sku.toLowerCase() === normalized);
    if (product) {
      this.addProductToCart(product);
      this.clearSearchInput();
      return;
    }

    const bundle = this.allBundles().find(b => b.code.toLowerCase() === normalized);
    if (bundle) {
      this.addBundleToCart(bundle);
      this.clearSearchInput();
      return;
    }

    this.loading.set(true);
    const branchId = this.selectedBranchId();
    const searchParams: Record<string, any> = { limit: 1, is_active: true };
    if (branchId) {
      searchParams['branch_id'] = branchId;
    }

    forkJoin({
      products: this.productApi.list({ ...searchParams, sku: code }),
      bundles: this.bundleApi.list({ ...searchParams, code, status: 'Active' }),
    }).subscribe({
      next: (res) => {
        if (res.products.items.length > 0) {
          this.addProductToCart(res.products.items[0]);
        } else if (res.bundles.items.length > 0) {
          this.addBundleToCart(res.bundles.items[0]);
        } else {
          this.searchQuery.set(code);
          this.currentSearch = code;
          this.resetAndReload();
        }
        this.loading.set(false);
        this.clearSearchInput();
      },
      error: () => {
        this.loading.set(false);
        this.searchQuery.set(code);
        this.currentSearch = code;
        this.resetAndReload();
      },
    });
  }

  private clearSearchInput(): void {
    this.searchQuery.set('');
    this.searchSubject.next('');
    if (this.searchInput) {
      this.searchInput.nativeElement.value = '';
      this.searchInput.nativeElement.focus();
    }
  }

  onCategorySelect(categoryId: string | null): void {
    this.selectedCategoryId.set(categoryId);
    this.currentCategoryId = categoryId;
    this.resetAndReload();
  }

  onBranchChange(branchId: string | null): void {
    this.selectedBranchId.set(branchId);
    this.resetAndReload();
  }

  onGridScroll(event: Event): void {
    const el = event.target as HTMLDivElement;
    const threshold = 200;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
      this.loadBatch();
    }
  }

  private loadBatch(): void {
    if (this.loadingMore() || this.loading()) return;
    if (!this.hasMoreItems()) return;

    const branchId = this.selectedBranchId();
    if (!this.canViewAllBranches() && !branchId) return;

    const isFirstLoad = this.allProducts().length === 0 && this.allBundles().length === 0;
    if (isFirstLoad) {
      this.loading.set(true);
    } else {
      this.loadingMore.set(true);
    }

    const baseParams: Record<string, any> = {
      limit: this.pageSize,
    };
    if (branchId) baseParams['branch_id'] = branchId;
    if (this.currentCategoryId) baseParams['category_id'] = this.currentCategoryId;
    if (this.currentSearch) baseParams['name'] = this.currentSearch;

    const calls: Record<string, Observable<any>> = {};
    if (this.hasMoreProducts()) {
      calls['products'] = this.productApi.list({ ...baseParams, offset: this.productsOffset(), is_active: true });
    }
    if (this.hasMoreBundles()) {
      calls['bundles'] = this.bundleApi.list({ ...baseParams, offset: this.bundlesOffset(), status: 'Active' });
    }

    forkJoin(calls).subscribe({
      next: (res) => {
        if (res['products']) {
          this.allProducts.update(items => [...items, ...res['products'].items]);
          this.productsOffset.update(v => v + res['products'].items.length);
          this.productsTotalCount.set(res['products'].totalCount);
        }
        if (res['bundles']) {
          this.allBundles.update(items => [...items, ...res['bundles'].items]);
          this.bundlesOffset.update(v => v + res['bundles'].items.length);
          this.bundlesTotalCount.set(res['bundles'].totalCount);
        }
        this.loading.set(false);
        this.loadingMore.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadingMore.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar los productos' });
      },
    });
  }

  private resetAndReload(): void {
    this.allProducts.set([]);
    this.allBundles.set([]);
    this.productsOffset.set(0);
    this.bundlesOffset.set(0);
    this.productsTotalCount.set(Infinity);
    this.bundlesTotalCount.set(Infinity);
    this.loadBatch();
  }

  getStockAvailable(item: CatalogItem): number {
    return item.stock - item.stockBlocked;
  }

  getUnitSymbol(item: CatalogItem): string {
    if (item.itemType === 'product') {
      return this.unitStore.getMeasurementUnitSymbol((item as Product).baseUnitId);
    }
    return '';
  }

  getItemSku(item: CatalogItem): string {
    if (item.itemType === 'product') {
      return (item as Product).sku;
    }
    return (item as Bundle).code;
  }

  onCardClick(item: CatalogItem): void {
    if (item.itemType === 'product') {
      this.addProductToCart(item as Product);
    } else {
      this.addBundleToCart(item as Bundle);
    }
  }

  private async addProductToCart(product: Product, quantity: number = 1, selectedPriceId?: string | null): Promise<void> {
    const stockAvailable = product.stock - product.stockBlocked;
    if (!this.systemConfigStore.negativeStock() && stockAvailable <= 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Sin stock',
        detail: `${product.name} no tiene stock disponible`,
      });
      return;
    }

    try {
      const prices = await firstValueFrom(this.priceApi.listByProductId(product.productId));
      if (!prices || prices.length === 0) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Sin precio',
          detail: `${product.name} no tiene precios registrados`,
        });
        return;
      }

      const price = selectedPriceId
        ? (prices.find(p => p.id === selectedPriceId) ?? prices[0])
        : prices[0];

      const options = this.buildPriceOptions(prices);

      const cartItem: SalesCartItem = {
        id: product.productId,
        itemType: 'product',
        name: product.name,
        sku: product.sku,
        imageUrl: product.img ?? null,
        unitPrice: price.amount,
        quantity,
        stockAvailable,
        stock: product.stock,
        canDecimalStock: this.resolveCanDecimalStock(product.baseUnitId),
        unitSymbol: this.unitStore.getMeasurementUnitSymbol(product.baseUnitId),
        priceCategoryId: price.priceCategoryId ?? null,
        selectedPriceId: price.id,
        priceOptions: options,
      };

      if (!this.salesCart.addItem(cartItem)) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Sin stock',
          detail: `${product.name} no tiene stock disponible`,
        });
        return;
      }

      this.messageService.add({
        severity: 'success',
        summary: 'Agregado',
        detail: `${product.name} x${quantity}`,
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: `No se pudieron cargar los precios de ${product.name}`,
      });
    }
  }

  private async addBundleToCart(bundle: Bundle, quantity: number = 1, selectedPriceId?: string | null): Promise<void> {
    const stockAvailable = bundle.stock - bundle.stockBlocked;
    if (!this.systemConfigStore.negativeStock() && stockAvailable <= 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Sin stock',
        detail: `${bundle.name} no tiene stock disponible`,
      });
      return;
    }

    const firstPrice = bundle.prices?.[0];
    if (!firstPrice) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Sin precio',
        detail: `${bundle.name} no tiene precios registrados`,
      });
      return;
    }

    const price = selectedPriceId
      ? (bundle.prices.find(p => p.id === selectedPriceId) ?? firstPrice)
      : firstPrice;

    const options = this.buildBundlePriceOptions(bundle.prices);

    const cartItem: SalesCartItem = {
      id: bundle.bundleId,
      itemType: 'bundle',
      name: bundle.name,
      sku: bundle.code,
      imageUrl: bundle.img ?? null,
      unitPrice: price.amount,
      quantity,
      stockAvailable,
      stock: bundle.stock,
      canDecimalStock: false,
      unitSymbol: '',
      priceCategoryId: price.priceCategoryId ?? null,
      selectedPriceId: price.id,
      priceOptions: options,
    };

    if (!this.salesCart.addItem(cartItem)) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Sin stock',
        detail: `${bundle.name} no tiene stock disponible`,
      });
      return;
    }

    this.messageService.add({
      severity: 'success',
      summary: 'Agregado',
      detail: `${bundle.name} x${quantity}`,
    });
  }

  canIncrement(item: SalesCartItem): boolean {
    if (this.systemConfigStore.negativeStock()) return true;
    return item.quantity < item.stockAvailable;
  }

  canDecrement(item: SalesCartItem): boolean {
    return item.quantity > 1;
  }

  onCartItemQuantityChange(id: string, value: number | null): void {
    if (value === null || value === undefined) return;
    const item = this.salesCart.items().find(i => i.id === id);
    if (!item) return;
    const min = item.canDecimalStock ? 0.01 : 1;
    const max = this.systemConfigStore.negativeStock() ? Infinity : item.stockAvailable;
    this.salesCart.updateQuantityItem(id, Math.max(min, Math.min(value, max)));
  }

  onCartPriceChange(itemId: string, priceId: string): void {
    const item = this.salesCart.items().find(i => i.id === itemId);
    if (!item) return;
    const option = item.priceOptions.find(o => o.id === priceId);
    if (!option) return;
    const priceCatId = item.priceOptions.length > 0
      ? this.priceCategories().find(c => option.label.startsWith(c.name))?.id ?? null
      : null;
    this.salesCart.updateItemPrice(itemId, option.amount, priceId, priceCatId);
  }

  private resolveCanDecimalStock(baseUnitId: string | null | undefined): boolean {
    if (!baseUnitId) return false;
    const unit = this.unitStore.getMeasurementUnit(baseUnitId);
    if (!unit?.classificationId) return false;
    return this.classificationStore.canDecimalStock(unit.classificationId);
  }

  openDetail(item: CatalogItem): void {
    if (item.itemType === 'product') {
      const p = item as Product;
      forkJoin({
        prices: this.priceApi.listByProductId(p.productId),
        factors: this.conversionApi.listByProductId(p.productId),
      }).subscribe({
        next: ({ prices, factors }) => {
          const options = this.buildPriceOptions(prices);
          const selected = options.length > 0 ? options[0] : null;
          const card: DetailProductCard = {
            id: p.productId,
            name: p.name,
            price: selected ? `$${selected.amount.toFixed(2)}` : '',
            description: '',
            imageUrl: p.img ?? '',
            alt: p.name,
            category: this.categoryStore.getCategoryName(p.categoryId),
            quantity: 1,
            stockAvailable: p.stock - p.stockBlocked,
            canDecimalStock: this.resolveCanDecimalStock(p.baseUnitId),
            unitSymbol: this.unitStore.getMeasurementUnitSymbol(p.baseUnitId),
            itemType: 'product',
            priceOptions: options,
            selectedPriceId: selected?.id ?? null,
            conversionUnits: this.buildConversionUnits(p.baseUnitId, factors),
          };
          this.detailProduct.set(card);
          this.detailVisible.set(true);
        },
        error: () => {
          const card: DetailProductCard = {
            id: p.productId,
            name: p.name,
            price: '',
            description: '',
            imageUrl: p.img ?? '',
            alt: p.name,
            category: this.categoryStore.getCategoryName(p.categoryId),
            quantity: 1,
            stockAvailable: p.stock - p.stockBlocked,
            canDecimalStock: this.resolveCanDecimalStock(p.baseUnitId),
            unitSymbol: this.unitStore.getMeasurementUnitSymbol(p.baseUnitId),
            itemType: 'product',
            priceOptions: [],
            selectedPriceId: null,
            conversionUnits: [],
          };
          this.detailProduct.set(card);
          this.detailVisible.set(true);
        },
      });
    } else {
      const b = item as Bundle;
      const options = this.buildBundlePriceOptions(b.prices);
      const selected = options.length > 0 ? options[0] : null;
      const card: DetailProductCard = {
        id: b.bundleId,
        name: b.name,
        price: selected ? `$${selected.amount.toFixed(2)}` : '',
        description: '',
        imageUrl: b.img ?? '',
        alt: b.name,
        category: this.categoryStore.getCategoryName(b.categoryId),
        quantity: 1,
        stockAvailable: b.stock - b.stockBlocked,
        canDecimalStock: false,
        unitSymbol: '',
        itemType: 'bundle',
        items: b.items?.map(i => ({ name: i.productId, quantity: i.quantity })),
        priceOptions: options,
        selectedPriceId: selected?.id ?? null,
        conversionUnits: [],
      };
      this.detailProduct.set(card);
      this.detailVisible.set(true);
    }
  }

  private buildConversionUnits(baseUnitId: string | null | undefined, factors: ConversionFactor[]): ConversionUnitOption[] {
    if (!baseUnitId) return [];

    const baseUnit = this.unitStore.getMeasurementUnit(baseUnitId);
    if (!baseUnit) return [];

    const units: ConversionUnitOption[] = [{
      unitId: baseUnit.id,
      unitName: baseUnit.name,
      unitSymbol: baseUnit.symbol,
      effectiveAmount: 1,
    }];

    if (factors.length === 0) return units;

    const forwardAdj = new Map<string, { to: string; amount: number }[]>();
    for (const f of factors) {
      const existing = forwardAdj.get(f.fromUnitId) ?? [];
      existing.push({ to: f.toUnitId, amount: f.amount });
      forwardAdj.set(f.fromUnitId, existing);
    }

    const seen = new Set<string>([baseUnitId]);
    const queue: { unitId: string; multiplier: number }[] = [
      { unitId: baseUnitId, multiplier: 1 },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.unitId !== baseUnitId) {
        const toUnit = this.unitStore.getMeasurementUnit(current.unitId);
        if (toUnit) {
          units.push({
            unitId: toUnit.id,
            unitName: toUnit.name,
            unitSymbol: toUnit.symbol,
            effectiveAmount: current.multiplier,
          });
        }
      }

      const neighbors = forwardAdj.get(current.unitId) ?? [];
      for (const n of neighbors) {
        if (seen.has(n.to)) continue;
        seen.add(n.to);
        queue.push({ unitId: n.to, multiplier: current.multiplier * n.amount });
      }
    }

    return units;
  }

  private buildPriceOptions(prices: ProductBranchPrice[]): PriceOption[] {
    return prices.map(p => {
      const cat = this.priceCategories().find(c => c.id === p.priceCategoryId);
      const name = cat?.name ?? 'Precio base';
      return { label: `${name} — $${p.amount.toFixed(2)}`, id: p.id, amount: p.amount };
    });
  }

  private buildBundlePriceOptions(prices: { id: string; priceCategoryId: string | null; amount: number }[]): PriceOption[] {
    return prices.map(p => {
      const cat = this.priceCategories().find(c => c.id === p.priceCategoryId);
      const name = cat?.name ?? 'Precio base';
      return { label: `${name} — $${p.amount.toFixed(2)}`, id: p.id, amount: p.amount };
    });
  }

  onDetailAddToCart(event: { id: string; quantity: number; selectedPriceId: string | null }): void {
    const product = this.allProducts().find(p => p.productId === event.id);
    if (product) {
      this.addProductToCart(product, event.quantity, event.selectedPriceId);
      return;
    }
    const bundle = this.allBundles().find(b => b.bundleId === event.id);
    if (bundle) {
      this.addBundleToCart(bundle, event.quantity, event.selectedPriceId);
    }
  }

  onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = '/not-found.png';
  }

  resolveImageUrl(img: string | null): string | null {
    if (!img) return null;
    if (img.startsWith('http://') || img.startsWith('https://')) return img;
    return img;
  }

  searchClient(): void {
    const doc = `${this.documentType()}${this.documentNumber()}`.trim();
    if (!doc || !this.documentNumber().trim()) return;

    this.searchingClient.set(true);
    this.personNotFound.set(false);

    this.clientApi.lookupByDocument(doc).subscribe({
      next: (result) => {
        this.searchingClient.set(false);
        if (result.exists && result.person) {
          this.salesCart.setClient(
            result.person.id,
            null,
            result.person.name,
            result.person.identity_document,
          );
          this.personNotFound.set(false);
        } else {
          this.personNotFound.set(true);
        }
      },
      error: () => {
        this.searchingClient.set(false);
        this.personNotFound.set(true);
      },
    });
  }

  onClientCreated(person: Person): void {
    this.showClientDialog.set(false);
    this.salesCart.setClient(person.id, null, person.name, person.identityDocument);
    this.personNotFound.set(false);
  }

  confirmClear(): void {
    this.confirmationService.confirm({
      message: 'Limpiar el carrito y el cliente seleccionado?',
      header: 'Confirmar',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Si, limpiar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.salesCart.clear();
        this.documentNumber.set('');
        this.searchQuery.set('');
        this.messageService.add({ severity: 'info', summary: 'Limpiado', detail: 'Carrito y cliente eliminados' });
      },
    });
  }

  async createOrder(): Promise<void> {
    if (this.saving()) return;
    if (this.salesCart.isEmpty()) {
      this.messageService.add({ severity: 'warn', summary: 'Carrito vacio', detail: 'Agrega items antes de crear la orden' });
      return;
    }
    if (!this.salesCart.hasClient()) {
      this.messageService.add({ severity: 'warn', summary: 'Cliente requerido', detail: 'Busca o crea un cliente antes de continuar' });
      return;
    }

    this.saving.set(true);

    const req: CreateOrderRequest = {
      branch_id: this.selectedBranchId()!,
      person_id: this.salesCart.personId() || undefined,
      client_user_id: this.salesCart.clientUserId() || undefined,
      notes: '',
      items: this.salesCart.items().map(item => ({
        item_type: item.itemType,
        product_id: item.itemType === 'product' ? item.id : undefined,
        bundle_id: item.itemType === 'bundle' ? item.id : undefined,
        quantity: item.quantity,
        unit_price: item.unitPrice,
      })),
    };

    try {
      await firstValueFrom(this.orderApi.create(req));
      this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Orden creada exitosamente' });
      this.salesCart.clear();
      this.documentNumber.set('');
      this.searchQuery.set('');
      this.clearSearchInput();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo crear la orden' });
    } finally {
      this.saving.set(false);
    }
  }
}
