import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, forkJoin, firstValueFrom } from 'rxjs';
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
import { SalesCartStore, SalesCartItem } from '../../../core/stores/sales-cart.store';
import { SystemConfigStore } from '../../../core/stores/system-config.store';
import { CategoryStore } from '../../../core/stores/category.store';
import { ProductApiService } from '../../../core/services/product-api.service';
import { BundleApiService } from '../../../core/services/bundle-api.service';
import { PriceApiService } from '../../../core/services/price-api.service';
import { PriceCategoryApiService } from '../../../core/services/price-category-api.service';
import { ClientApiService } from '../../../core/services/client-api.service';
import { OrderApiService } from '../../../core/services/order-api.service';
import { Product } from '../../../core/models/product.model';
import { Bundle } from '../../../core/models/bundle.model';
import { PriceCategory } from '../../../core/models/price-category.model';
import { ProductBranchPrice } from '../../../core/models/price.model';
import { CreateOrderRequest } from '../../../core/models/order.model';
import { DOCUMENT_TYPE_OPTIONS } from '../../../core/models/document-type.model';
import { Person } from '../../../core/models/person.model';
import { ClientFormDialogComponent } from '../orders/client-form-dialog.component';
import { ProductDetailDialogComponent } from '../../../shared/product-detail-dialog/product-detail-dialog.component';

type CatalogItem = (Product & { itemType: 'product'; id: string }) | (Bundle & { itemType: 'bundle'; id: string });

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
  itemType: 'product' | 'bundle';
  items?: { name: string; quantity: number }[];
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
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly router = inject(Router);

  protected readonly canCreate = computed(() => this.authStore.hasPermission('sales:create'));
  protected readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly searchingClient = signal(false);
  protected readonly products = signal<Product[]>([]);
  protected readonly bundles = signal<Bundle[]>([]);
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

  private readonly searchSubject = new Subject<string>();

  protected readonly categories = computed(() => {
    const catIds = new Set<string>();
    this.products().forEach(p => { if (p.categoryId) catIds.add(p.categoryId); });
    this.bundles().forEach(b => { if (b.categoryId) catIds.add(b.categoryId); });
    return this.categoryStore.categoryOptions().filter(opt => catIds.has(opt.value));
  });

  protected readonly filteredCatalogItems = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const catId = this.selectedCategoryId();
    let items: CatalogItem[] = [
      ...this.products().map(p => ({ ...p, itemType: 'product' as const, id: p.productId })),
      ...this.bundles().map(b => ({ ...b, itemType: 'bundle' as const, id: b.bundleId })),
    ];

    if (catId) {
      items = items.filter(i => {
        if ('categoryId' in i) return i.categoryId === catId;
        return false;
      });
    }
    if (query) {
      items = items.filter(i => {
        const name = i.name.toLowerCase();
        const sku = 'sku' in i ? (i as Product).sku : (i as Bundle).code;
        return name.includes(query) || sku.toLowerCase().includes(query);
      });
    }
    return items;
  });

  constructor() {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
    ).subscribe(query => {
      this.searchQuery.set(query);
    });
  }

  ngOnInit(): void {
    this.categoryStore.load();
    const branchId = this.userBranchId();
    if (!branchId) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo determinar la sucursal' });
      return;
    }

    this.loading.set(true);
    forkJoin({
      products: this.productApi.list({ branch_id: branchId, limit: 100, is_active: true }),
      bundles: this.bundleApi.list({ branch_id: branchId, limit: 100, status: 'PUBLISHED' }),
      priceCategories: this.priceCategoryApi.list(),
    }).subscribe({
      next: (res) => {
        this.products.set(res.products.items);
        this.bundles.set(res.bundles.items);
        this.priceCategories.set(res.priceCategories);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar los productos' });
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

  private tryBarcodeScan(code: string): void {
    const normalized = code.trim().toLowerCase();

    const product = this.products().find(p => p.sku.toLowerCase() === normalized);
    if (product) {
      this.addProductToCart(product);
      this.clearSearchInput();
      return;
    }

    const bundle = this.bundles().find(b => b.code.toLowerCase() === normalized);
    if (bundle) {
      this.addBundleToCart(bundle);
      this.clearSearchInput();
      return;
    }

    this.searchQuery.set(code);
  }

  private clearSearchInput(): void {
    this.searchQuery.set('');
    this.searchSubject.next('');
    if (this.searchInput) {
      this.searchInput.nativeElement.value = '';
      this.searchInput.nativeElement.focus();
    }
  }

  getStockAvailable(item: CatalogItem): number {
    return item.stock - item.stockBlocked;
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

  private async addProductToCart(product: Product): Promise<void> {
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

      const price = prices[0];
      const category = this.priceCategories().find(c => c.id === price.priceCategoryId);

      const cartItem: SalesCartItem = {
        id: product.productId,
        itemType: 'product',
        name: product.name,
        sku: product.sku,
        imageUrl: product.img ?? null,
        unitPrice: price.amount,
        quantity: 1,
        stockAvailable,
        stock: product.stock,
        priceCategoryId: price.priceCategoryId ?? null,
        selectedPriceId: price.id,
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
        detail: `${product.name} x1`,
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: `No se pudieron cargar los precios de ${product.name}`,
      });
    }
  }

  private async addBundleToCart(bundle: Bundle): Promise<void> {
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

    const cartItem: SalesCartItem = {
      id: bundle.bundleId,
      itemType: 'bundle',
      name: bundle.name,
      sku: bundle.code,
      imageUrl: bundle.img ?? null,
      unitPrice: firstPrice.amount,
      quantity: 1,
      stockAvailable,
      stock: bundle.stock,
      priceCategoryId: firstPrice.priceCategoryId ?? null,
      selectedPriceId: firstPrice.id,
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
      detail: `${bundle.name} x1`,
    });
  }

  canIncrement(item: SalesCartItem): boolean {
    if (this.systemConfigStore.negativeStock()) return true;
    return item.quantity < item.stockAvailable;
  }

  openDetail(item: CatalogItem): void {
    let card: DetailProductCard;
    if (item.itemType === 'product') {
      const p = item as Product;
      card = {
        id: p.productId,
        name: p.name,
        price: '',
        description: '',
        imageUrl: p.img ?? '',
        alt: p.name,
        category: this.categoryStore.getCategoryName(p.categoryId),
        quantity: 1,
        stockAvailable: p.stock - p.stockBlocked,
        itemType: 'product',
      };
    } else {
      const b = item as Bundle;
      card = {
        id: b.bundleId,
        name: b.name,
        price: '',
        description: '',
        imageUrl: b.img ?? '',
        alt: b.name,
        category: this.categoryStore.getCategoryName(b.categoryId),
        quantity: 1,
        stockAvailable: b.stock - b.stockBlocked,
        itemType: 'bundle',
        items: b.items?.map(i => ({ name: i.productId, quantity: i.quantity })),
      };
    }
    this.detailProduct.set(card);
    this.detailVisible.set(true);
  }

  onDetailAddToCart(event: { id: string; quantity: number }): void {
    const product = this.products().find(p => p.productId === event.id);
    if (product) {
      this.addProductToCart(product);
      return;
    }
    const bundle = this.bundles().find(b => b.bundleId === event.id);
    if (bundle) {
      this.addBundleToCart(bundle);
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
      branch_id: this.userBranchId()!,
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
