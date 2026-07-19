# Plan: Modulo de Ventas (POS / Punto de Venta)

## Resumen Ejecutivo

Modulo de punto de venta (POS) que permite a los operadores crear ordenes rapidamente desde una interfaz de dos paneles: catalogo de productos (izquierda) y panel de venta/carrito (derecha). El modulo reutiliza el endpoint existente `POST /api/v1/orders/` (que ya soporta creacion admin con `IsAdmin=true`) y añade un nuevo dominio de permisos `sales:view` / `sales:create`.

---

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────┐
│  Admin Layout (sidebar)                                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  POS Page (/admin/sales)                                │ │
│  │                                                         │ │
│  │  ┌──────────────────────┐  ┌──────────────────────────┐ │ │
│  │  │  Catalogo (izq/centro)│  │  Panel Venta (derecha)   │ │ │
│  │  │                      │  │                          │ │ │
│  │  │  [Buscador/Codigo]   │  │  [Buscador Cliente]      │ │ │
│  │  │  [Filtro categorias] │  │  [Info cliente seleccionado]│ │
│  │  │  Grid de Cards       │  │  Lista items (nombre,    │ │ │
│  │  │  (producto/combo)    │  │  precio, subtotal, +/-,  │ │ │
│  │  │                      │  │  eliminar)               │ │ │
│  │  │                      │  │  ──────────────────────── │ │ │
│  │  │                      │  │  Total: $XXX.XX          │ │ │
│  │  │                      │  │  [Limpiar] [Crear Orden] │ │ │
│  │  └──────────────────────┘  └──────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Estructura de Componentes (Frontend)

### 1.1 Archivos a crear

```
web/src/app/
  core/
    stores/
      sales-cart.store.ts          ← Signal Store separada del CartStore de landing
  pages/admin/
    sales/
      sales-page.component.ts      ← Pagina principal POS
      sales-page.component.html    ← Layout de dos paneles
      sales-page.component.scss    ← Estilos del layout POS
```

### 1.2 Dependencias del modulo (imports existentes a reutilizar)

| Dependencia | Archivo | Uso en POS |
|---|---|---|
| `ProductApiService` | `core/services/product-api.service.ts` | Cargar productos por sucursal |
| `BundleApiService` | `core/services/bundle-api.service.ts` | Cargar combos por sucursal |
| `PriceApiService` | `core/services/price-api.service.ts` | Precios por producto |
| `PriceCategoryApiService` | `core/services/price-category-api.service.ts` | Nombres de categorias de precio |
| `ClientApiService` | `core/services/client-api.service.ts` | `lookupByDocument()` para buscar cliente |
| `PersonApiService` | `core/services/person-api.service.ts` | `createClient()` desde dialogo |
| `OrderApiService` | `core/services/order-api.service.ts` | `create()` para enviar la orden |
| `BranchApiService` | `core/services/branch-api.service.ts` | Sucursal del usuario |
| `AuthStore` | `core/auth/auth.store.ts` | Permisos, branchId del usuario |
| `SystemConfigStore` | `core/stores/system-config.store.ts` | Flag `negativeStock` |
| `CategoryStore` | `core/stores/category.store.ts` | Filtro de categorias |
| `DOCUMENT_TYPE_OPTIONS` | `core/models/document-type.model.ts` | Selector de tipo de documento |
| `ClientFormDialogComponent` | `pages/admin/orders/client-form-dialog.component.ts` | Dialogo de creacion de cliente (reutilizar existente) |
| `ProductDetailDialogComponent` | `shared/product-detail-dialog/` | Modal de detalle de producto/combo |

### 1.3 Modelo de datos del carrito POS (`SalesCartItem`)

```typescript
// core/stores/sales-cart.store.ts

export interface SalesCartItem {
  id: string;                    // productId o bundleId
  itemType: 'product' | 'bundle';
  name: string;
  sku: string;                   // sku (producto) o code (combo)
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  stockAvailable: number;        // stock - stockBlocked
  stock: number;                 // stock total
  priceCategoryId: string | null;
  selectedPriceId: string | null;
}
```

### 1.4 Modelo de estado del formulario POS

```typescript
// Dentro de sales-page.component.ts

interface SalesForm {
  // Cliente
  personId: string | null;
  clientUserId: string | null;
  clientName: string | null;
  clientDocument: string | null;

  // Busqueda
  searchQuery: string;
}
```

---

## 2. Sales Cart Store (Signal Store)

### 2.1 Por que separada del `CartStore` existente

| Aspecto | `CartStore` (landing) | `SalesCartStore` (POS) |
|---|---|---|
| Contexto | Cliente final navegando la tienda | Operador en caja |
| Persistencia | localStorage (`lcdpc_cart`) | Ninguna (sesion efemera) |
| Branch | Reemplaza todo el carrito al cambiar branch | Fijada al branch del usuario |
| Cliente | Opcional (guest orders) | Requerido (busqueda por documento) |
| Stock validation | `systemConfigStore.negativeStock()` | Validacion estricta (sin stock = no agrega) |
| Precios | Primer precio del producto | Seleccion explicita de precio por categoria |
| Crear orden | `OrderApiService.create()` publico | `OrderApiService.create()` con auth admin |

### 2.2 Interface y signals

```typescript
@Injectable({ providedIn: 'root' })
export class SalesCartStore {
  private readonly systemConfigStore = inject(SystemConfigStore);

  // Estado privado
  private readonly _items = signal<SalesCartItem[]>([]);
  private readonly _personId = signal<string | null>(null);
  private readonly _clientUserId = signal<string | null>(null);
  private readonly _clientName = signal<string | null>(null);
  private readonly _clientDocument = signal<string | null>(null);

  // Estado publico (readonly)
  readonly items = this._items.asReadonly();
  readonly personId = this._personId.asReadonly();
  readonly clientUserId = this._clientUserId.asReadonly();
  readonly clientName = this._clientName.asReadonly();
  readonly clientDocument = this._clientDocument.asReadonly();

  // Computed
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

  // Metodos
  addItem(product: Product | Bundle, price: ProductBranchPrice, category: PriceCategory | null): void;
  incrementItem(id: string): void;
  decrementItem(id: string): void;
  removeItem(id: string): void;
  setClient(personId: string | null, clientUserId: string | null, name: string, document: string): void;
  clearClient(): void;
  clear(): void;  // Limpia items + cliente
  canAddItem(id: string): boolean;  // Verifica stock
  getStockError(id: string): string | null;  // Mensaje de error de stock
}
```

### 2.3 Logica clave del store

#### `addItem()` — Agregar producto al carrito

```typescript
addItem(product: Product | Bundle, price: ProductBranchPrice, category: PriceCategory | null): void {
  const id = 'productId' in product ? product.productId : product.bundleId;
  const stockAvailable = product.stock - product.stockBlocked;

  // Validar stock (si negativeStock esta desactivado)
  if (!this.systemConfigStore.negativeStock()) {
    if (stockAvailable <= 0) {
      // Retornar error o toast desde el componente
      return;
    }
  }

  this._items.update(items => {
    const existing = items.find(i => i.id === id);
    if (existing) {
      const newQty = existing.quantity + 1;
      // Validar stock para incremento
      if (!this.systemConfigStore.negativeStock() && newQty > stockAvailable) {
        return items; // No incrementar
      }
      return items.map(i =>
        i.id === id ? { ...i, quantity: newQty } : i
      );
    }
    // Item nuevo
    const name = 'name' in product ? product.name : (product as Bundle).name;
    const sku = 'sku' in product ? (product as Product).sku : (product as Bundle).code;
    const img = product.img ?? null;

    return [...items, {
      id,
      itemType: 'productId' in product ? 'product' : 'bundle',
      name,
      sku,
      imageUrl: img,
      unitPrice: price.amount,
      quantity: 1,
      stockAvailable,
      stock: product.stock,
      priceCategoryId: price.priceCategoryId ?? null,
      selectedPriceId: price.id,
    }];
  });
}
```

#### `incrementItem()` — Con validacion de stock

```typescript
incrementItem(id: string): void {
  this._items.update(items => {
    return items.map(i => {
      if (i.id !== id) return i;
      if (!this.systemConfigStore.negativeStock()) {
        if (i.quantity >= i.stockAvailable) return i; // No incrementar
      }
      return { ...i, quantity: i.quantity + 1 };
    });
  });
}
```

#### `clear()` — Limpiar todo

```typescript
clear(): void {
  this._items.set([]);
  this._personId.set(null);
  this._clientUserId.set(null);
  this._clientName.set(null);
  this._clientDocument.set(null);
}
```

---

## 3. Pagina POS (`sales-page.component.ts`)

### 3.1 Arquitectura del componente

```typescript
@Component({
  selector: 'app-sales-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, InputTextModule,
    InputGroupModule, SelectModule, ToastModule, TooltipModule,
    ConfirmDialogModule, DialogModule, InputNumberModule,
    TagModule, FloatLabelModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './sales-page.component.html',
  styleUrl: './sales-page.component.scss',
})
export class SalesPageComponent implements OnInit {
  // Inyeccion
  private readonly authStore = inject(AuthStore);
  private readonly salesCart = inject(SalesCartStore);
  private readonly productApi = inject(ProductApiService);
  private readonly bundleApi = inject(BundleApiService);
  private readonly priceApi = inject(PriceApiService);
  private readonly priceCategoryApi = inject(PriceCategoryApiService);
  private readonly clientApi = inject(ClientApiService);
  private readonly personApi = inject(PersonApiService);
  private readonly orderApi = inject(OrderApiService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly router = inject(Router);

  // Permisos
  protected readonly canCreate = computed(() => this.authStore.hasPermission('sales:create'));
  protected readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);

  // Estado local
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly creatingClient = signal(false);
  protected readonly searchQuery = signal('');
  protected readonly products = signal<Product[]>([]);
  protected readonly bundles = signal<Bundle[]>([]);
  protected readonly priceCategories = signal<PriceCategory[]>([]);
  protected readonly selectedCategoryId = signal<string | null>(null);

  // Busqueda de cliente
  protected readonly documentType = signal('V');
  protected readonly documentNumber = signal('');
  protected readonly DOCUMENT_TYPE_OPTIONS = DOCUMENT_TYPE_OPTIONS;
  protected readonly searchingClient = signal(false);
  protected readonly personNotFound = signal(false);
  protected readonly showClientDialog = signal(false);

  // Catalogo filtrado
  protected readonly filteredCatalogItems = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const catId = this.selectedCategoryId();
    let items: CatalogItem[] = [...this.products().map(p => ({ ...p, itemType: 'product' as const })),
                                 ...this.bundles().map(b => ({ ...b, itemType: 'bundle' as const }))];

    if (catId) {
      items = items.filter(i => i.categoryId === catId);
    }
    if (query) {
      items = items.filter(i =>
        i.name.toLowerCase().includes(query) ||
        ('sku' in i ? i.sku : (i as Bundle).code).toLowerCase().includes(query)
      );
    }
    return items;
  });

  // Categorias disponibles
  protected readonly categories = computed(() => {
    const catIds = new Set<string>();
    this.products().forEach(p => { if (p.categoryId) catIds.add(p.categoryId); });
    this.bundles().forEach(b => { if (b.categoryId) catIds.add(b.categoryId); });
    // Resolver desde CategoryStore
    return this.categoryStore.categoryOptions().filter(opt =>
      catIds.has(opt.value)
    );
  });
}
```

### 3.2 Flujo de carga (`ngOnInit`)

```typescript
ngOnInit(): void {
  const branchId = this.userBranchId();
  if (!branchId) {
    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo determinar la sucursal' });
    return;
  }

  // Cargar todo en paralelo
  forkJoin({
    products: this.productApi.list({ branch_id: branchId, limit: 100, is_active: true }),
    bundles: this.bundleApi.list({ branch_id: branchId, limit: 100, status: 'PUBLISHED' }),
    priceCategories: this.priceCategoryApi.list(),
  }).subscribe({
    next: (res) => {
      this.products.set(res.products.items);
      this.bundles.set(res.bundles.items);
      this.priceCategories.set(res.priceCategories);
    },
    error: () => {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar los productos' });
    }
  });
}
```

### 3.3 Logica del buscador (barcode scanner + busqueda por nombre)

```typescript
// Subject para busqueda por nombre con debounce
private readonly searchSubject = new Subject<string>();

constructor() {
  // Busqueda por nombre con debounce (no para barcode)
  this.searchSubject.pipe(
    debounceTime(300),
    distinctUntilChanged(),
  ).subscribe(query => {
    this.searchQuery.set(query);
  });
}

// Cuando el usuario presiona Enter en el buscador
onSearchKeyup(event: KeyboardEvent): void {
  const input = (event.target as HTMLInputElement).value.trim();

  if (event.key === 'Enter' && input) {
    event.preventDefault();
    this.tryBarcodeScan(input);
    return;
  }

  // Para busqueda por nombre: debounce
  this.searchSubject.next(input);
}

// Escaneo de codigo de barras (busqueda exacta)
private tryBarcodeScan(code: string): void {
  // Buscar en productos por SKU
  const product = this.products().find(p =>
    p.sku.toLowerCase() === code.toLowerCase()
  );
  if (product) {
    this.addProductToCart(product);
    this.searchQuery.set('');
    this.searchSubject.next('');
    // Limpiar el input HTML tambien
    return;
  }

  // Buscar en combos por code
  const bundle = this.bundles().find(b =>
    b.code.toLowerCase() === code.toLowerCase()
  );
  if (bundle) {
    this.addBundleToCart(bundle);
    this.searchQuery.set('');
    this.searchSubject.next('');
    return;
  }

  // Si no encontro exacto, buscar por nombre
  this.searchQuery.set(code);
}
```

### 3.4 Agregar item al carrito desde Card

```typescript
async addProductToCart(product: Product): Promise<void> {
  const stockAvailable = product.stock - product.stockBlocked;

  if (!this.systemConfigStore.negativeStock() && stockAvailable <= 0) {
    this.messageService.add({
      severity: 'warn',
      summary: 'Sin stock',
      detail: `${product.name} no tiene stock disponible`,
    });
    return;
  }

  // Cargar precios si no los tiene
  const prices = await firstValueFrom(this.priceApi.listByProductId(product.productId));
  if (!prices || prices.length === 0) {
    this.messageService.add({
      severity: 'warn',
      summary: 'Sin precio',
      detail: `${product.name} no tiene precios registrados`,
    });
    return;
  }

  // Seleccionar primer precio (o el que coincida con la primera categoria)
  const price = prices[0];
  const category = this.priceCategories().find(c => c.id === price.priceCategoryId);

  this.salesCart.addItem(product, price, category);

  this.messageService.add({
    severity: 'success',
    summary: 'Agregado',
    detail: `${product.name} x1`,
  });
}
```

### 3.5 Busqueda de cliente

```typescript
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
          null, // clientUserId se resuelve en backend
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
    }
  });
}

onClientCreated(person: Person): void {
  this.showClientDialog.set(false);
  this.salesCart.setClient(person.id, null, person.name, person.identityDocument);
  this.personNotFound.set(false);
}
```

### 3.6 Crear orden

```typescript
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
  } catch {
    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo crear la orden' });
  } finally {
    this.saving.set(false);
  }
}
```

### 3.7 Limpiar carrito

```typescript
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
    }
  });
}
```

---

## 4. Template POS (`sales-page.component.html`)

### 4.1 Layout general

```html
<section class="sales-page">
  <!-- Panel izquierdo: Catalogo -->
  <div class="sales-catalog">
    <!-- Buscador -->
    <div class="catalog-search">
      <p-inputgroup>
        <span class="p-inputgroup-addon"><i class="pi pi-search"></i></span>
        <input pInputText
               [ngModel]="searchQuery()"
               (ngModelChange)="searchQuery.set($event)"
               (keyup)="onSearchKeyup($event)"
               placeholder="Buscar producto o escanear codigo..."
               autofocus />
      </p-inputgroup>
    </div>

    <!-- Filtro de categorias -->
    <div class="category-filters">
      <p-button label="Todos" [severity]="selectedCategoryId() === null ? 'primary' : 'secondary'"
                [outlined]="selectedCategoryId() !== null" size="small"
                (onClick)="selectedCategoryId.set(null)" />
      @for (cat of categories(); track cat.value) {
        <p-button [label]="cat.label"
                  [severity]="selectedCategoryId() === cat.value ? 'primary' : 'secondary'"
                  [outlined]="selectedCategoryId() !== cat.value" size="small"
                  (onClick)="selectedCategoryId.set(cat.value)" />
      }
    </div>

    <!-- Grid de productos -->
    <div class="product-grid">
      @for (item of filteredCatalogItems(); track item.id) {
        <div class="product-card" (click)="onCardClick(item)">
          <div class="product-image">
            @if (item.img) {
              <img [src]="resolveImageUrl(item.img)" [alt]="item.name" loading="lazy"
                   (error)="onImageError($event)" />
            } @else {
              <div class="product-placeholder"><i class="pi pi-box"></i></div>
            }
            @if (item.itemType === 'bundle') {
              <p-tag value="Combo" severity="success" class="product-tag" />
            }
          </div>
          <div class="product-info">
            <h4 class="product-name">{{ item.name }}</h4>
            <div class="product-meta">
              <span class="product-sku">{{ item.itemType === 'product' ? item.sku : item.code }}</span>
              <span class="product-stock" [class.out-of-stock]="getStockAvailable(item) <= 0">
                Stock: {{ getStockAvailable(item) }}
              </span>
            </div>
          </div>
          <div class="product-actions">
            <p-button icon="pi pi-eye" [text]="true" [rounded]="true" size="small"
                      (onClick)="openDetail(item); $event.stopPropagation()"
                      pTooltip="Ver detalle" />
          </div>
        </div>
      } @empty {
        <div class="empty-catalog">
          <i class="pi pi-search"></i>
          <p>No se encontraron productos</p>
        </div>
      }
    </div>
  </div>

  <!-- Panel derecho: Venta -->
  <div class="sales-panel">
    <!-- Cabecera: Buscador de cliente -->
    <div class="panel-header">
      <h2>Venta</h2>

      @if (!salesCart.hasClient()) {
        <div class="client-search">
          <div class="client-search-input">
            <p-select [options]="DOCUMENT_TYPE_OPTIONS" [(ngModel)]="documentType"
                      optionLabel="label" optionValue="value"
                      [style]="{'width': '80px', 'flex-shrink': '0'}" />
            <input pInputText [(ngModel)]="documentNumber"
                   placeholder="Cedula/RIF..."
                   (keydown.enter)="searchClient(); $event.preventDefault()"
                   style="width: 100%" />
            <p-button icon="pi pi-search" severity="primary"
                      [loading]="searchingClient()"
                      (onClick)="searchClient()" />
          </div>
          @if (personNotFound()) {
            <div class="client-action">
              <p-button label="Crear Cliente" icon="pi pi-user-plus"
                        severity="success" [outlined]="true" size="small"
                        (onClick)="showClientDialog.set(true)" />
            </div>
          }
        </div>
      } @else {
        <div class="client-selected">
          <i class="pi pi-user"></i>
          <div class="client-info">
            <span class="client-name">{{ salesCart.clientName() }}</span>
            <span class="client-doc">{{ salesCart.clientDocument() }}</span>
          </div>
          <p-button icon="pi pi-times" [text]="true" [rounded]="true" severity="danger"
                    size="small" (onClick)="salesCart.clearClient()" pTooltip="Quitar cliente" />
        </div>
      }
    </div>

    <!-- Cuerpo: Lista de items -->
    <div class="panel-body">
      @for (item of salesCart.items(); track item.id) {
        <div class="cart-item">
          <div class="cart-item-info">
            <span class="cart-item-name">{{ item.name }}</span>
            <span class="cart-item-price">${{ item.unitPrice.toFixed(2) }}</span>
          </div>
          <div class="cart-item-controls">
            <p-button icon="pi pi-minus" [text]="true" [rounded]="true" size="small"
                      (onClick)="salesCart.decrementItem(item.id)" />
            <span class="cart-item-qty">{{ item.quantity }}</span>
            <p-button icon="pi pi-plus" [text]="true" [rounded]="true" size="small"
                      [disabled]="!canIncrement(item)"
                      (onClick)="salesCart.incrementItem(item.id)" />
            <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small"
                      severity="danger" (onClick)="salesCart.removeItem(item.id)" />
          </div>
          <div class="cart-item-subtotal">
            ${{ (item.unitPrice * item.quantity).toFixed(2) }}
          </div>
        </div>
      } @empty {
        <div class="empty-cart">
          <i class="pi pi-shopping-cart"></i>
          <p>Agrega productos desde el catalogo</p>
        </div>
      }
    </div>

    <!-- Pie: Total y acciones -->
    <div class="panel-footer">
      <div class="cart-total">
        <span>Total ({{ salesCart.totalItems() }} items):</span>
        <strong>${{ salesCart.totalPrice().toFixed(2) }}</strong>
      </div>
      <div class="cart-actions">
        <p-button label="Limpiar" icon="pi pi-times" severity="danger" [outlined]="true"
                  [disabled]="salesCart.isEmpty()"
                  (onClick)="confirmClear()" />
        <p-button label="Crear Orden" icon="pi pi-check"
                  [loading]="saving()" [disabled]="salesCart.isEmpty() || !salesCart.hasClient()"
                  (onClick)="createOrder()" />
      </div>
    </div>
  </div>
</section>

<!-- Dialogo de creacion de cliente -->
<app-client-form-dialog
  [visible]="showClientDialog()"
  [identityDocument]="documentType() + documentNumber()"
  (visibleChange)="showClientDialog.set($event)"
  (clientCreated)="onClientCreated($event)"
  (back)="showClientDialog.set(false)" />

<p-confirmDialog />
<p-toast />
```

### 4.2 Estilos clave (`sales-page.component.scss`)

```scss
.sales-page {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 1rem;
  height: calc(100vh - 60px);  /* Full viewport minus admin header */
  overflow: hidden;
}

// Catalogo
.sales-catalog {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow: hidden;
}

.catalog-search {
  flex-shrink: 0;
}

.category-filters {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.75rem;
  overflow-y: auto;
  padding-bottom: 1rem;
}

.product-card {
  background: var(--surface);
  border-radius: 8px;
  box-shadow: var(--shadow);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  display: flex;
  flex-direction: column;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
}

.product-image {
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 8px 8px 0 0;
  position: relative;
  background: #f5f5f5;

  img { width: 100%; height: 100%; object-fit: cover; }
  .product-tag { position: absolute; top: 0.5rem; right: 0.5rem; }
}

.product-info {
  padding: 0.75rem;
  flex: 1;
}

.product-name {
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.9rem;
  margin: 0 0 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--text-soft);
}

.out-of-stock { color: #ba1a1a; font-weight: 600; }

.product-actions {
  padding: 0 0.75rem 0.75rem;
}

// Panel de venta
.sales-panel {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-radius: 8px;
  box-shadow: var(--shadow);
  overflow: hidden;
}

.panel-header {
  padding: 1rem;
  border-bottom: 1px solid var(--border);

  h2 {
    font-family: var(--font-display);
    font-size: 1.3rem;
    margin: 0 0 0.75rem;
  }
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 1rem;
}

.panel-footer {
  padding: 1rem;
  border-top: 2px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.cart-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);

  &:last-child { border-bottom: none; }
}

.cart-item-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cart-item-name {
  font-weight: 500;
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 0.5rem;
}

.cart-item-price {
  font-size: 0.8rem;
  color: var(--text-soft);
}

.cart-item-controls {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.cart-item-qty {
  min-width: 24px;
  text-align: center;
  font-weight: 600;
}

.cart-item-subtotal {
  text-align: right;
  font-weight: 600;
  font-size: 0.85rem;
}

.cart-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1.1rem;

  strong { font-size: 1.3rem; }
}

.cart-actions {
  display: flex;
  gap: 0.5rem;

  p-button { flex: 1; }
}

.client-selected {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 6px;

  .client-info {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  .client-name { font-weight: 600; font-size: 0.85rem; }
  .client-doc { font-size: 0.75rem; color: var(--text-soft); }
}

.empty-cart, .empty-catalog {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  color: var(--text-soft);
  font-size: 0.85rem;

  i { font-size: 2rem; opacity: 0.5; }
}

@media (max-width: 768px) {
  .sales-page {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 300px;
  }
}
```

---

## 5. Backend: Permisos y Migracion

### 5.1 Nuevos permisos `sales`

El modulo POS reutiliza el endpoint existente `POST /api/v1/orders/` (que ya soporta creacion admin). Los nuevos permisos `sales:view` y `sales:create` se usan **solo en el frontend** para controlar acceso a la pagina y el boton de crear orden. El backend sigue validando `order:create` en el handler de ordenes.

**Opcion alternativa** (si se quiere proteccion backend): Crear un endpoint dedicado `POST /api/v1/sales/orders` que valide `sales:create` internamente. Esto agrega una capa extra de seguridad pero requiere mas codigo backend.

**Decision recomendada**: Usar permisos `sales:view` y `sales:create` solo en el frontend. El backend ya valida `order:create` en el handler de ordenes existente. Esto es consistente con como funciona `view:branch:all` (permiso frontend que controla visibilidad).

### 5.2 Migracion

Crear archivo `api/migrations/0000XX_add_sales_permissions.up.sql`:

```sql
-- Nuevos recursos para el modulo de ventas (POS)
INSERT INTO resources (id, code, description, created_at_utc, updated_at_utc)
VALUES
  ('77777777-0000-0000-0000-000000000001', 'sales:view', 'Acceso al modulo de ventas (POS)', now(), now()),
  ('77777777-0000-0000-0000-000000000002', 'sales:create', 'Crear ordenes desde el POS', now(), now())
ON CONFLICT (code) DO NOTHING;

-- Asignar a roles existentes
-- global_admin: todos los permisos
INSERT INTO role_resources (role_id, resource_id)
SELECT r.id, res.id
FROM roles r, resources res
WHERE r.code = 'global_admin' AND res.code IN ('sales:view', 'sales:create')
ON CONFLICT DO NOTHING;

-- branch_admin: todos los permisos
INSERT INTO role_resources (role_id, resource_id)
SELECT r.id, res.id
FROM roles r, resources res
WHERE r.code = 'branch_admin' AND res.code IN ('sales:view', 'sales:create')
ON CONFLICT DO NOTHING;

-- manager: todos los permisos
INSERT INTO role_resources (role_id, resource_id)
SELECT r.id, res.id
FROM roles r, resources res
WHERE r.code = 'manager' AND res.code IN ('sales:view', 'sales:create')
ON CONFLICT DO NOTHING;

-- staff: solo sales:view
INSERT INTO role_resources (role_id, resource_id)
SELECT r.id, res.id
FROM roles r, resources res
WHERE r.code = 'staff' AND res.code = 'sales:view'
ON CONFLICT DO NOTHING;
```

### 5.3 RBAC en el sidebar

En `admin-layout.component.ts` añadir:

```typescript
protected readonly canViewSales = computed(() =>
  this.authStore.hasPermission('sales:view')
);
```

En `admin-layout.component.html` añadir entrada en el sidebar (despues de Ordenes):

```html
@if (canViewSales()) {
  <a routerLink="/admin/sales" routerLinkActive="active" (click)="collapseAll()">
    <span class="pi pi-dollar"></span>
    <span class="nav-label">Ventas</span>
  </a>
}
```

### 5.4 Ruta en `app.routes.ts`

```typescript
import { SalesPageComponent } from './pages/admin/sales/sales-page.component';

// Dentro de admin children:
{ path: 'sales', component: SalesPageComponent, canActivate: [permissionGuard('sales:view')] },
```

---

## 6. Flujo de Escaneo de Codigo de Barras

### 6.1 Comportamiento esperado

1. El operador enfoca el input de busqueda (autofocus).
2. El lector de codigo de barras escribe rapido el codigo y presiona Enter automaticamente.
3. El componente detecta `keyup.enter` con un valor en el input.
4. Busca exactamente por `sku` (productos) o `code` (combos) usando comparacion case-insensitive.
5. **Si encuentra coincidencia exacta**: agrega 1 unidad al carrito, muestra toast de confirmacion, limpia el input.
6. **Si no encuentra**: treat como busqueda por nombre (debounced).

### 6.2 Implementacion clave

```typescript
// En sales-page.component.ts

// Referencia al input HTML para limpiar programaticamente
@ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

private tryBarcodeScan(code: string): void {
  const normalized = code.trim().toLowerCase();

  // Buscar producto por SKU (exacto)
  const product = this.products().find(p => p.sku.toLowerCase() === normalized);
  if (product) {
    this.addProductToCart(product);
    this.clearSearchInput();
    return;
  }

  // Buscar combo por code (exacto)
  const bundle = this.bundles().find(b => b.code.toLowerCase() === normalized);
  if (bundle) {
    this.addBundleToCart(bundle);
    this.clearSearchInput();
    return;
  }

  // Si no encontro exacto, usar como busqueda por nombre
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
```

---

## 7. Control de Stock

### 7.1 Reglas

| Escenario | Comportamiento |
|---|---|
| Click en Card + `negativeStock=false` y `stockAvailable <= 0` | Toast "sin stock", NO agregar |
| Click en Card + `negativeStock=false` y `stockAvailable > 0` | Agregar con qty=1 |
| Click (+) + `negativeStock=false` y `qty >= stockAvailable` | NO incrementar, boton (+) deshabilitado |
| Click (-) + `qty > 1` | Decrementar |
| Click (-) + `qty = 1` | Eliminar item del carrito |
| `negativeStock=true` | Sin restricciones de stock |

### 7.2 Deshabilitar boton (+)

```typescript
canIncrement(item: SalesCartItem): boolean {
  if (this.systemConfigStore.negativeStock()) return true;
  return item.quantity < item.stockAvailable;
}
```

---

## 8. Prevencion de Doble Envio

El boton "Crear Orden" usa el patron de loading signal existente:

```typescript
// Signal
protected readonly saving = signal(false);

// En el template
<p-button label="Crear Orden" [loading]="saving()" [disabled]="..." (onClick)="createOrder()" />

// En el metodo
async createOrder(): Promise<void> {
  if (this.saving()) return;  // Early return si ya esta en proceso
  this.saving.set(true);
  try {
    // ... crear orden
  } finally {
    this.saving.set(false);
  }
}
```

---

## 9. Resumen de Archivos a Crear/Modificar

### Archivos a CREAR

| Archivo | Descripcion |
|---|---|
| `web/src/app/core/stores/sales-cart.store.ts` | Signal Store del carrito POS |
| `web/src/app/pages/admin/sales/sales-page.component.ts` | Componente principal POS |
| `web/src/app/pages/admin/sales/sales-page.component.html` | Template del POS |
| `web/src/app/pages/admin/sales/sales-page.component.scss` | Estilos del POS |
| `api/migrations/0000XX_add_sales_permissions.up.sql` | Migracion de permisos |

### Archivos a MODIFICAR

| Archivo | Cambio |
|---|---|
| `web/src/app/app.routes.ts` | Agregar ruta `/admin/sales` |
| `web/src/app/pages/admin/admin-layout.component.ts` | Agregar `canViewSales` signal |
| `web/src/app/pages/admin/admin-layout.component.html` | Agregar link "Ventas" en sidebar |

---

## 10. Orden de Implementacion

1. **Migracion backend** — Crear permisos `sales:view` y `sales:create` en la BD.
2. **SalesCartStore** — Crear la signal store separada en `core/stores/sales-cart.store.ts`.
3. **Ruta y sidebar** — Agregar ruta en `app.routes.ts`, signal en `admin-layout.component.ts`, link en `admin-layout.component.html`.
4. **Componente POS** — Crear `sales-page.component.ts`, `.html`, `.scss` con todo el layout y logica.
5. **Testing** — Verificar flujo completo: carga de productos, busqueda, escaneo, creacion de cliente, creacion de orden.
6. **Ajustes UI** — Refinamientos de estilos, responsive, edge cases.

---

## 11. Notas Importantes

- **No se crea un nuevo endpoint backend**: El modulo reutiliza `POST /api/v1/orders/` existente. Los permisos `sales:view/create` son solo de control de acceso en el frontend.
- **El carrito POS NO persiste en localStorage**: Es una sesion efemera. Si el operador recarga la pagina, se pierde el carrito. Esto es intencional (diferente al carrito de la landing page).
- **Precios**: Se usa el patron de `PriceOption` existente. Al agregar un producto, se toma el primer precio registrado. Si se necesita seleccion explicita, se puede extender con un `p-select` en cada fila del carrito.
- **Detalle de producto/combo**: Se reutiliza `ProductDetailDialogComponent` existente en `shared/product-detail-dialog/`.
