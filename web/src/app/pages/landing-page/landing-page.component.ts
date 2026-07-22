import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ProductApiService } from '../../core/services/product-api.service';
import { BundleApiService } from '../../core/services/bundle-api.service';
import { PriceApiService } from '../../core/services/price-api.service';
import { PriceCategoryApiService } from '../../core/services/price-category-api.service';
import { CategoryStore } from '../../core/stores/category.store';
import { BranchApiService } from '../../core/services/branch-api.service';
import { Branch } from '../../core/models/branch.model';
import { BranchStore } from '../../core/stores/branch.store';
import { CartStore } from '../../core/stores/cart.store';
import { SystemConfigStore } from '../../core/stores/system-config.store';
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
  imports: [CommonModule, HeroComponent, CatalogComponent, BranchesComponent, ProductDetailDialogComponent],
  templateUrl: './landing-page.component.html'
})
export class LandingPageComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly productApi = inject(ProductApiService);
  private readonly bundleApi = inject(BundleApiService);
  private readonly priceApi = inject(PriceApiService);
  private readonly priceCategoryApi = inject(PriceCategoryApiService);
  readonly categoryStore = inject(CategoryStore);
  private readonly branchApi = inject(BranchApiService);
  private readonly branchStore = inject(BranchStore);
  private readonly cartStore = inject(CartStore);
  readonly systemConfigStore = inject(SystemConfigStore);

  protected readonly activeHeroIndex = signal(0);
  protected readonly search = signal('');
  protected readonly selectedCategoryId = signal('all');
  protected readonly products = signal<ProductCard[]>([]);
  protected readonly branches = signal<BranchCard[]>([]);
  protected readonly selectedProduct = signal<ProductCard | null>(null);
  protected readonly detailDialogVisible = signal(false);

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
    const term = this.search().trim().toLowerCase();
    const category = this.selectedCategoryId();

    return this.products().filter((product) => {
      const matchesCategory = category === 'all' || product.categoryId === category;
      const matchesTerm =
        term.length === 0 ||
        [product.name, product.description, product.category, product.badge ?? '', (product.items ?? []).map((i) => i.name).join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(term);

      return matchesCategory && matchesTerm;
    });
  });

  constructor() {
    effect(() => {
      this.cartStore.lastOrderCreatedAt();
      const branchId = this.branchStore.selectedBranchId();
      if (branchId) {
        this.loadProducts(branchId);
      }
    });
  }

  ngOnInit(): void {
    this.categoryStore.load();

    this.branchApi.list().subscribe({
      next: (branches: Branch[]) => {
        this.branches.set(
          branches.map((b) => ({
            id: b.id,
            name: b.storeName,
            address: b.address,
            phone: b.contactPhone,
            icon: 'storefront'
          }))
        );
      },
    });
  }

  private loadProducts(branchId: string): void {
    forkJoin({
      products: this.productApi.list({ branch_id: branchId, is_active: true }),
      bundles: this.bundleApi.list({ branch_id: branchId }),
      priceCategories: this.priceCategoryApi.list(),
    }).subscribe({
      next: ({ products, bundles, priceCategories }) => {
          const retailCategory = priceCategories.find((c) => c.code === 'RETAIL');
          const retailCategoryId = retailCategory?.id ?? null;

          const productMap = new Map(products.items.map((p) => [p.productId, p.name]));

          const bundleCards: ProductCard[] = bundles.items
          .filter((b) => b.status === 'Active')
          .map((b) => {
            const retailPrice = b.prices.find((p) => p.priceCategoryId === retailCategoryId);
            const items = (b.items ?? []).map((bi) => ({
              name: productMap.get(bi.productId) ?? `Producto #${bi.productId}`,
              quantity: bi.quantity,
            }));
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
              quantity: 1,
              branchId: b.branchId,
              stockAvailable: b.stockAvailable,
              itemType: 'bundle' as const,
              items,
            };
          });

        const productCards: ProductCard[] = products.items.map((p) => ({
          id: p.productId,
          name: p.name,
          price: '$0.00',
          priceNumeric: 0,
          description: '',
          imageUrl: this.productApi.resolveImageUrl(p.img) ?? NOT_FOUND_IMAGE,
          alt: p.name,
          categoryId: p.categoryId ?? '',
          category: this.categoryStore.getCategoryName(p.categoryId),
          quantity: 1,
          branchId: p.branchId,
          stockAvailable: p.stockAvailable,
          itemType: 'product' as const,
        }));

        if (productCards.length === 0 || !retailCategoryId) {
          const all = [...bundleCards, ...productCards];
          this.syncCartStock(all);
          this.products.set(all);
          return;
        }

        const priceCalls = productCards.map((p) =>
          this.priceApi.listByProductId(p.id)
        );

        forkJoin(priceCalls).subscribe({
          next: (pricesPerProduct) => {
            pricesPerProduct.forEach((prices, i) => {
              const retail = prices.find((pr) => pr.priceCategoryId === retailCategoryId);
              if (retail) {
                productCards[i].priceNumeric = retail.amount;
                productCards[i].price = `$${retail.amount.toFixed(2)}`;
              }
            });
            this.products.set([...bundleCards, ...productCards]);
            this.syncCartStock([...bundleCards, ...productCards]);
          },
          error: () => {
            this.products.set([...bundleCards, ...productCards]);
            this.syncCartStock([...bundleCards, ...productCards]);
          },
        });
      },
      error: () => {
        this.products.set([]);
      }
    });
  }

  private syncCartStock(cards: ProductCard[]): void {
    const stockMap = new Map(cards.map((c) => [c.id, c.stockAvailable]));
    this.cartStore.syncStock(stockMap);
  }

  protected selectCategory(categoryId: string): void {
    this.selectedCategoryId.set(categoryId);
  }

  protected incrementQuantity(productId: string): void {
    this.products.update((items) =>
      items.map((p) => {
        if (p.id !== productId) return p;
        if (!this.systemConfigStore.negativeStock() && p.stockAvailable <= 0) return p;
        const max = p.stockAvailable;
        const newQty = this.systemConfigStore.negativeStock() ? p.quantity + 1 : Math.min(p.quantity + 1, max);
        return { ...p, quantity: newQty };
      })
    );
  }

  protected decrementQuantity(productId: string): void {
    this.products.update((items) =>
      items.map((p) => {
        if (p.id !== productId) return p;
        const newQty = Math.max(1, p.quantity - 1);
        return { ...p, quantity: newQty };
      })
    );
  }

  protected addToCart(productId: string): void {
    const product = this.products().find((p) => p.id === productId);
    if (!product) return;

    this.cartStore.addItem(
      {
        id: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        price: product.priceNumeric,
        branchId: product.branchId,
        stockAvailable: product.stockAvailable,
        itemType: product.itemType,
        items: product.items,
      },
      product.quantity
    );

    this.products.update((items) =>
      items.map((p) => (p.id === productId ? { ...p, quantity: 1 } : p))
    );
  }

  protected openDetail(productId: string): void {
    const product = this.products().find((p) => p.id === productId);
    if (!product) return;
    this.selectedProduct.set(product);
    this.detailDialogVisible.set(true);
  }

  protected onDetailAddToCart(event: { id: string; quantity: number }): void {
    const product = this.products().find((p) => p.id === event.id);
    if (!product) return;

    this.cartStore.addItem(
      {
        id: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        price: product.priceNumeric,
        branchId: product.branchId,
        stockAvailable: product.stockAvailable,
        itemType: product.itemType,
        items: product.items,
      },
      event.quantity
    );

    this.products.update((items) =>
      items.map((p) => (p.id === event.id ? { ...p, quantity: 1 } : p))
    );
  }

  protected goToAdvancedSearch(query: string): void {
    this.router.navigate(['/search'], {
      queryParams: query ? { q: query } : {}
    });
  }
}
