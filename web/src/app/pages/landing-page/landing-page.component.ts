import { CommonModule } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, OnInit, OnDestroy, runInInjectionContext, signal, Injector } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, of, Subject, forkJoin, map } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ProductApiService } from '../../core/services/product-api.service';
import { BundleApiService } from '../../core/services/bundle-api.service';
import { PriceApiService } from '../../core/services/price-api.service';
import { PriceCategoryApiService } from '../../core/services/price-category-api.service';
import { CategoryStore } from '../../core/stores/category.store';
import { BranchStore } from '../../core/stores/branch.store';
import { CartStore } from '../../core/stores/cart.store';
import { SystemConfigStore } from '../../core/stores/system-config.store';
import { MeasurementUnitStore } from '../../core/stores/measurement-unit.store';
import { MeasurementUnitClassificationStore } from '../../core/stores/measurement-unit-classification.store';
import { Product } from '../../core/models/product.model';
import { Bundle } from '../../core/models/bundle.model';
import { PriceCategory } from '../../core/models/price-category.model';
import { BranchesComponent } from '../../shared/branches/branches.component';
import { CatalogComponent } from '../../shared/catalog/catalog.component';
import { HeroComponent } from '../../shared/hero/hero.component';
import { ProductDetailDialogComponent } from '../../shared/product-detail-dialog/product-detail-dialog.component';

const NOT_FOUND_IMAGE = '/not-found.png';

type HeroSlide = {
  title: string;
  imageUrl: string;
  alt: string;
};

type ProductCard = {
  id: string;
  name: string;
  price: string;
  priceNumeric: number;
  description: string;
  imageUrl: string;
  alt: string;
  categoryId: string;
  category: string;
  badge?: string;
  featured?: boolean;
  quantity: number;
  branchId: string | null;
  stockAvailable: number;
  canDecimalStock: boolean;
  unitSymbol: string;
  itemType: 'product' | 'bundle';
  items?: { name: string; quantity: number }[];
};

type BranchCard = {
  id: string;
  name: string;
  address: string;
  phone: string;
  icon: string;
};

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [CommonModule, HeroComponent, CatalogComponent, BranchesComponent, ProductDetailDialogComponent, ToastModule],
  templateUrl: './landing-page.component.html'
})
export class LandingPageComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly productApi = inject(ProductApiService);
  private readonly bundleApi = inject(BundleApiService);
  private readonly priceApi = inject(PriceApiService);
  private readonly priceCategoryApi = inject(PriceCategoryApiService);
  readonly categoryStore = inject(CategoryStore);
  private readonly branchStore = inject(BranchStore);
  private readonly cartStore = inject(CartStore);
  readonly systemConfigStore = inject(SystemConfigStore);
  private readonly unitStore = inject(MeasurementUnitStore);
  private readonly classificationStore = inject(MeasurementUnitClassificationStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messageService = inject(MessageService);
  private readonly injector = inject(Injector);

  private readonly PAGE_SIZE = 20;
  protected readonly searchSubject = new Subject<string>();
  private initialLoadDone = false;
  private lastBranchId = '';
  private branchSelectionAttempted = false;

  protected readonly activeHeroIndex = signal(0);
  protected readonly search = signal('');
  protected readonly selectedCategoryId = signal('all');
  protected readonly allProducts = signal<Product[]>([]);
  protected readonly allBundles = signal<Bundle[]>([]);
  protected readonly productsOffset = signal(0);
  protected readonly bundlesOffset = signal(0);
  protected readonly productsTotalCount = signal(Infinity);
  protected readonly bundlesTotalCount = signal(Infinity);
  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly productRetailPrices = signal<Map<string, number>>(new Map());
  protected readonly priceCategories = signal<PriceCategory[]>([]);
  protected readonly branches = signal<BranchCard[]>([]);
  protected readonly selectedProduct = signal<ProductCard | null>(null);
  protected readonly detailDialogVisible = signal(false);
  protected readonly productQuantities = signal<Map<string, number>>(new Map());
  private readonly pendingProductCode = signal<string | null>(null);

  protected readonly heroSlides: HeroSlide[] = [
    {
      title: '500 GRS de Nuggets 1 Kg Papas Salchichas',
      imageUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBBoEgsJ6MOR1J_3qJRGLiCwkc_qkteFtduHfbt3P3-FwUexh1tMYz0Hy5ywgxNj1LzdLx951ChpwPPnPApY-uiIQB12LrIcx5A-zxuABp8WMurCPbd7toIzIggUOvgRVELMDDDTk3tsCUvWtyBohLPxP9goQLftIPs52fJLOKddVVGeG23CyHrLoAtElndP87qwrOCZd2Xgr4ukWZBLkdlwvmrfHd2FEcVXIAG5L3uwkT4mr9C8AVBZXWvEySVoAriOHvvuKVkGhU',
      alt: 'Promoción principal de ingredientes para perros calientes'
    },
    {
      title: 'Combo para emprendedores con precio mayorista',
      imageUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBzDseBhHu9EwvRAco9ePAKN5P7xc9lx9fVoTnM1edHkFtu_nDMQr2z-_cRfekhrcHfOsJ_W_buOJqgVb_OLp4UoqKPBEVhA6IMMxYyEzkCUXOxGEbY5hFUMU0uelIITl_FMyarwcgYh9jWX3voMm8b7UAZD56M8Lp1wv_G-ELO4GrfqtnS5IKepgNLU6prrPnJmoHkSBPP3CJTkFgVkigEbMfXbd4i2mp8PTN_OMNFCjv-SSEVZsbNNt1yMDBcbYATQYyIFK63k7A',
      alt: 'Combo emprendedor con salchichas, panes y salsas'
    },
    {
      title: 'Catálogo mayorista con producto de alta rotación',
      imageUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCtjIPGFwHKbCB9WVJ-opSccsbmZktXss9K_ruOrt4T4IgGn540li3OvT1CyGSw7LIc46VNpyxxsEjJm6LHKIKg8E_QnDewh7g6k5k7ZHeQxxdAZDUIac2uvVIXBwCoouE180Fe-HvYuPW13gB3zRHA_kHGV1WPdLGYwffDJOAT7VXDLbl_q5CY2UtDTrDHbeWCk41n7wXXnIAeD1vRotyuj79aw41K_6Nl3bRf6bsdWSln08t-mGT2p9etEKdbAHBy8dTPKyznxJ0',
      alt: 'Salchichas al vacío para catálogo mayorista'
    }
  ];

  protected readonly filteredProducts = computed(() => {
    const prices = this.productRetailPrices();
    const quantities = this.productQuantities();
    const negativeStock = this.systemConfigStore.negativeStock();
    const maxQty = negativeStock ? 9999 : undefined;
    const productCards: ProductCard[] = this.allProducts().map((p) => {
      const retailPrice = prices.get(p.productId) ?? 0;
      const stored = quantities.get(p.productId) ?? 1;
      const capped = maxQty != null ? Math.min(stored, maxQty) : Math.min(stored, p.stockAvailable || 1);
      return {
        id: p.productId,
        name: p.name,
        price: `$${retailPrice.toFixed(2)}`,
        priceNumeric: retailPrice,
        description: '',
        imageUrl: this.productApi.resolveImageUrl(p.img) ?? NOT_FOUND_IMAGE,
        alt: p.name,
        categoryId: p.categoryId ?? '',
        category: this.categoryStore.getCategoryName(p.categoryId),
        quantity: Math.max(1, capped),
        branchId: p.branchId,
        stockAvailable: p.stockAvailable,
        canDecimalStock: this.resolveCanDecimalStock(p.baseUnitId),
        unitSymbol: this.unitStore.getMeasurementUnitSymbol(p.baseUnitId),
        itemType: 'product' as const,
      };
    });

    const bundleCards: ProductCard[] = this.allBundles().map((b) => {
      const retailCategory = this.priceCategories().find((c) => c.code === 'RETAIL');
      const retailPrice = b.prices.find((p) => p.priceCategoryId === retailCategory?.id);
      const productMap = new Map(this.allProducts().map((p) => [p.productId, p.name]));
      const items = (b.items ?? []).map((bi) => ({
        name: productMap.get(bi.productId) ?? `Producto #${bi.productId}`,
        quantity: bi.quantity,
      }));
      const stored = quantities.get(b.bundleId) ?? 1;
      const capped = maxQty != null ? Math.min(stored, maxQty) : Math.min(stored, b.stockAvailable || 1);
      return {
        id: b.bundleId,
        name: b.name,
        price: retailPrice ? `$${retailPrice.amount.toFixed(2)}` : '$0.00',
        priceNumeric: retailPrice?.amount ?? 0,
        description: `Código: ${b.code}`,
        imageUrl: this.bundleApi.resolveImageUrl(b.img) ?? NOT_FOUND_IMAGE,
        alt: b.name,
        categoryId: b.categoryId ?? '',
        category: this.categoryStore.getCategoryName(b.categoryId),
        featured: true,
        quantity: Math.max(1, capped),
        branchId: b.branchId,
        stockAvailable: b.stockAvailable,
        canDecimalStock: false,
        unitSymbol: '',
        itemType: 'bundle' as const,
        items,
      };
    });

    return [...bundleCards, ...productCards];
  });

  protected readonly hasMoreProducts = computed(() => this.productsOffset() < this.productsTotalCount());
  protected readonly hasMoreBundles = computed(() => this.bundlesOffset() < this.bundlesTotalCount());
  protected readonly hasMoreItems = computed(() => this.hasMoreProducts() || this.hasMoreBundles());

  constructor() {
    this.searchSubject.subscribe((query) => {
      this.search.set(query);
    });

    const branchPoll = setInterval(() => {
      const id = this.branchStore.selectedBranchId();
      if (id && id !== this.lastBranchId) {
        const wasInitial = !this.initialLoadDone;
        this.lastBranchId = id;
        if (!wasInitial) {
          this.resetAndReload();
        }
      }
    }, 1000);

    this.destroyRef.onDestroy(() => clearInterval(branchPoll));
  }

  ngOnInit(): void {
    this.categoryStore.load();
    this.unitStore.load();
    this.classificationStore.load();

    const branchCode = this.route.snapshot.queryParamMap.get('branch');
    const productCode = this.route.snapshot.queryParamMap.get('product');

    if (productCode) {
      this.pendingProductCode.set(productCode);
    }

    this.priceCategoryApi.list().subscribe({
      next: (categories) => this.priceCategories.set(categories),
    });

    this.branchStore.load();

    if (branchCode) {
      runInInjectionContext(this.injector, () => {
        effect(() => {
          const storeBranches = this.branchStore.branches();
          if (storeBranches.length > 0 && !this.branchSelectionAttempted) {
            this.branchStore.selectBranchByCode(branchCode);
            this.branchSelectionAttempted = true;
            this.branches.set(storeBranches.map((b) => ({
              id: b.id, name: b.name, address: b.address, phone: b.phone, icon: 'storefront',
            })));
          }
        });
      });
    } else {
      runInInjectionContext(this.injector, () => {
        effect(() => {
          const storeBranches = this.branchStore.branches();
          if (storeBranches.length > 0 && !this.branchSelectionAttempted) {
            this.branchSelectionAttempted = true;
            this.branches.set(storeBranches.map((b) => ({
              id: b.id, name: b.name, address: b.address, phone: b.phone, icon: 'storefront',
            })));
          }
        });
      });
    }

    this.waitForBranchAndLoad();
  }

  ngOnDestroy(): void {
    this.searchSubject.complete();
  }

  private waitForBranchAndLoad(): void {
    const branchCheck = setInterval(() => {
      const id = this.branchStore.selectedBranchId();
      if (id && this.branchSelectionAttempted) {
        clearInterval(branchCheck);
        this.initialLoadDone = true;
        this.lastBranchId = id;
        this.loadBatch();
      }
    }, 50);

    this.destroyRef.onDestroy(() => clearInterval(branchCheck));
  }

  private resolveCanDecimalStock(baseUnitId: string | null | undefined): boolean {
    if (!baseUnitId) return false;
    const unit = this.unitStore.getMeasurementUnit(baseUnitId);
    if (!unit?.classificationId) return false;
    return this.classificationStore.canDecimalStock(unit.classificationId);
  }

  protected loadBatch(): void {
    if (this.loadingMore() || this.loading()) return;
    if (!this.hasMoreItems()) return;

    const branchId = this.branchStore.selectedBranchId();
    if (!branchId) return;

    const isFirstLoad = this.allProducts().length === 0 && this.allBundles().length === 0;
    if (isFirstLoad) {
      this.loading.set(true);
    } else {
      this.loadingMore.set(true);
    }

    const baseParams: Record<string, any> = {
      limit: this.PAGE_SIZE,
      branch_id: branchId,
      is_active: true,
    };
    const categoryId = this.selectedCategoryId();
    if (categoryId && categoryId !== 'all') baseParams['category_id'] = categoryId;

    const productCode = this.pendingProductCode();
    const searchQuery = this.search();

    const productParams = { ...baseParams };
    const bundleParams = { ...baseParams };

    if (productCode) {
      productParams['sku'] = productCode;
      bundleParams['code'] = productCode;
    } else if (searchQuery) {
      productParams['name'] = searchQuery;
      bundleParams['name'] = searchQuery;
    }

    const calls: { products?: Observable<any>; bundles?: Observable<any> } = {};
    if (this.hasMoreProducts()) {
      calls.products = this.productApi.list({ ...productParams, offset: this.productsOffset() });
    }
    if (this.hasMoreBundles()) {
      calls.bundles = this.bundleApi.list({ ...bundleParams, offset: this.bundlesOffset(), status: 'Active' });
    }

    if (!calls.products && !calls.bundles) {
      this.loading.set(false);
      this.loadingMore.set(false);
      return;
    }

    forkJoin({
      products: calls.products ?? of(null),
      bundles: calls.bundles ?? of(null),
    }).subscribe({
      next: (res) => {
        const newProducts: Product[] = res.products?.items ?? [];
        const newBundles: Bundle[] = res.bundles?.items ?? [];

        if (res.products) {
          this.allProducts.update((items) => [...items, ...newProducts]);
          this.productsOffset.update((v) => v + newProducts.length);
          this.productsTotalCount.set(res.products.totalCount);
        }
        if (res.bundles) {
          this.allBundles.update((items) => [...items, ...newBundles]);
          this.bundlesOffset.update((v) => v + newBundles.length);
          this.bundlesTotalCount.set(res.bundles.totalCount);
        }

        this.loading.set(false);
        this.loadingMore.set(false);

        if (productCode && (newProducts.length > 0 || newBundles.length > 0)) {
          const foundId = newProducts.length > 0 ? newProducts[0].productId : newBundles[0]?.bundleId;
          this.pendingProductCode.set(null);
          this.loadPricesForNewProducts(newProducts).subscribe({
            next: () => { if (foundId) this.openDetail(foundId); },
          });
        } else {
          this.loadPricesForNewProducts(newProducts).subscribe();
          if (productCode) {
            this.pendingProductCode.set(null);
          }
        }
      },
      error: () => {
        this.loading.set(false);
        this.loadingMore.set(false);
        this.pendingProductCode.set(null);
      },
    });
  }

  private loadPricesForNewProducts(newProducts: Product[]): Observable<void> {
    const retailCategory = this.priceCategories().find((c) => c.code === 'RETAIL');
    const retailCategoryId = retailCategory?.id ?? null;

    if (newProducts.length === 0 || !retailCategoryId) return of(undefined);

    const priceCalls = newProducts.map((p) => this.priceApi.listByProductId(p.productId));

    return forkJoin(priceCalls).pipe(
      map((pricesPerProduct) => {
        const newPrices = new Map(this.productRetailPrices());
        pricesPerProduct.forEach((prices, i) => {
          const retail = prices.find((pr) => pr.priceCategoryId === retailCategoryId);
          if (retail) {
            newPrices.set(newProducts[i].productId, retail.amount);
          }
        });
        this.productRetailPrices.set(newPrices);
      })
    );
  }

  private resetAndReload(): void {
    this.loading.set(false);
    this.loadingMore.set(false);
    this.allProducts.set([]);
    this.allBundles.set([]);
    this.productsOffset.set(0);
    this.bundlesOffset.set(0);
    this.productsTotalCount.set(Infinity);
    this.bundlesTotalCount.set(Infinity);
    this.productRetailPrices.set(new Map());
    this.productQuantities.set(new Map());
    this.loadBatch();
  }

  protected selectCategory(categoryId: string): void {
    this.selectedCategoryId.set(categoryId);
    this.resetAndReload();
  }

  protected incrementQuantity(productId: string): void {
    const cards = this.filteredProducts();
    const product = cards.find((p) => p.id === productId);
    if (!product) return;

    const current = this.productQuantities().get(productId) ?? product.quantity;
    const negativeStock = this.systemConfigStore.negativeStock();
    const maxQty = negativeStock ? 9999 : product.stockAvailable;

    if (!negativeStock && current >= product.stockAvailable) return;

    const next = new Map(this.productQuantities());
    next.set(productId, Math.min(current + 1, maxQty));
    this.productQuantities.set(next);
  }

  protected decrementQuantity(productId: string): void {
    const cards = this.filteredProducts();
    const product = cards.find((p) => p.id === productId);
    if (!product) return;

    const current = this.productQuantities().get(productId) ?? product.quantity;
    const min = product.canDecimalStock ? 0.01 : 1;
    const newQty = Math.max(min, current - 1);

    const next = new Map(this.productQuantities());
    next.set(productId, newQty);
    this.productQuantities.set(next);
  }

  protected onQuantityInputChange(event: { productId: string; quantity: number }): void {
    const cards = this.filteredProducts();
    const product = cards.find((p) => p.id === event.productId);
    if (!product) return;

    const negativeStock = this.systemConfigStore.negativeStock();
    const maxQty = negativeStock ? 9999 : product.stockAvailable;
    const min = product.canDecimalStock ? 0.01 : 1;
    const clamped = Math.max(min, Math.min(event.quantity, maxQty));

    const next = new Map(this.productQuantities());
    next.set(event.productId, clamped);
    this.productQuantities.set(next);
  }

  protected addToCart(productId: string): void {
    const cards = this.filteredProducts();
    const product = cards.find((p) => p.id === productId);
    if (!product) return;

    this.cartStore.addItem(
      {
        id: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        price: product.priceNumeric,
        branchId: product.branchId,
        stockAvailable: product.stockAvailable,
        canDecimalStock: product.canDecimalStock,
        unitSymbol: product.unitSymbol,
        itemType: product.itemType,
        items: product.items,
      },
      product.quantity
    );

    this.messageService.add({
      severity: 'success',
      summary: 'Producto agregado',
      detail: `${product.name} añadido al carrito`,
      life: 1500
    });

    const next = new Map(this.productQuantities());
    next.set(productId, 1);
    this.productQuantities.set(next);
  }

  protected openDetail(productId: string): void {
    const cards = this.filteredProducts();
    const product = cards.find((p) => p.id === productId);
    if (!product) return;
    this.selectedProduct.set(product);
    this.detailDialogVisible.set(true);
  }

  protected onDetailAddToCart(event: { id: string; quantity: number }): void {
    const cards = this.filteredProducts();
    const product = cards.find((p) => p.id === event.id);
    if (!product) return;

    this.cartStore.addItem(
      {
        id: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        price: product.priceNumeric,
        branchId: product.branchId,
        stockAvailable: product.stockAvailable,
        canDecimalStock: product.canDecimalStock,
        unitSymbol: product.unitSymbol,
        itemType: product.itemType,
        items: product.items,
      },
      event.quantity
    );

    this.messageService.add({
      severity: 'success',
      summary: 'Producto agregado',
      detail: `${product.name} añadido al carrito`,
      life: 1500
    });

    const next = new Map(this.productQuantities());
    next.set(event.id, 1);
    this.productQuantities.set(next);
  }

  protected goToAdvancedSearch(query: string): void {
    this.search.set(query);
    this.resetAndReload();
  }
}
