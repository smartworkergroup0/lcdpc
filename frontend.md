# Frontend rules (Angular 20 + PrimeNG)

## Facts agents often guess wrong

- The real frontend root is `web/`, not `api/LCDPC/web/`.
- `web/` is not scaffold-only: it already has standalone components, route wiring, PrimeNG theme setup, and active auth/register flows.
- Package-manager rule: use `pnpm` only for JS/TS work unless the user explicitly approves otherwise.
- Existing route/UI language is English (`/login`, `/register`); extend the current app vocabulary instead of introducing Spanish mid-feature.

## Permission-gated rendering

If a user lacks permission for an action, module, or view, the corresponding button, menu item, or page access must not be rendered. Use `computed()` + `authStore.hasPermission()` to gate visibility.

## Architectural standards

### Project structure
- Real frontend root is `web/`, not `api/LCDPC/web/`.
- Standalone components (no NgModules).
- Signals for state management (Angular 20+).
- Package manager: `pnpm` only.

### Directory layout
```
web/src/app/
  core/
    auth/          — auth store, interceptor, init, guards, hasPermission directive
    models/        — TypeScript interfaces matching API structs (13 files)
    services/      — API services (one per domain, 12 files)
    stores/        — domain stores with signals (e.g. CategoryStore)
  pages/           — route-level components
    landing-page/
    search-page/
    auth-page/     — login + AuthApiService (defines API_BASE_URL token)
    register-page/ — multi-step OTP registration flow
    admin/
      admin-layout.component  — collapsible sidebar with permission-gated menu groups
      dashboard/
      products/    — list + form dialog (with prices & conversions sub-forms)
      bundles/     — list + form dialog (with items sub-form)
      orders/      — list + detail dialog + items dialog + status change dialog
      staff/       — list + form dialog
      classifications/ — measurement unit classifications CRUD
      config/      — section-based config page (?section= query param)
        sections/
          categories-section
          price-categories-section
          measurement-units-section
          rbac-section (profiles, roles, resources with nested assignment dialogs)
  shared/          — reusable UI components (PrimeNG-based)
    header/
    footer/
    hero/
    catalog/
    catalog-search/
    advanced-search/
    branches/
    cart-dialog/   — cart management dialog with order creation
  components/      — legacy plain-HTML versions of hero, catalog, branches (no PrimeNG)
```

### Models (`core/models/`)
- One file per domain: `product.model.ts`, `bundle.model.ts`, `category.model.ts`, etc.
- Interfaces use camelCase (mapped from snake_case API responses).
- Nullable fields typed as `T | null`.
- Pagination model in `pagination.model.ts`: `PaginatedResponse<T>`, `ProductListFilter`, `BundleListFilter`.
- The frontend `AppUser` model mirrors backend with a single `name: string | null` field (not `firstName`/`lastName`).

### Customer identification (document types)
- Venezuelan identity document types are: `V` (Venezolano), `E` (Extranjero), `J` (Jurídico), `G` (Gobierno), `C` (Civil/Diplomático).
- Defined in `core/models/document-type.model.ts` as `DOCUMENT_TYPE_OPTIONS` (array of `{label, value}` objects) and `DocumentType` type.
- The backend stores the type as a **prefix** in `users.identity_document` (VARCHAR(40)), e.g., `"V12345678"` — there is no separate `document_type` column.
- Search by document: `GET /api/v1/users/by-document/{doc}` receives the concatenated string (e.g., `"V12345678"`).
- Frontend pattern: let the user select the type via `<p-select>` and type the number in a separate `<input>`, then concatenate before calling the API:
  ```typescript
  const doc = `${this.documentType}${this.documentNumber}`;
  this.userApi.getByDocument(doc).subscribe(...)
  ```
- This pattern is used in `order-form-dialog.component.ts` and `register-page.component.ts`.

### Services (`core/services/`)
- One service per domain: `product-api.service.ts`, `bundle-api.service.ts`, etc.
- Inject `HttpClient` and `API_BASE_URL` (injection token).
- `API_BASE_URL` comes from `environment.apiBaseUrl` via `app.config.ts`.
- All services are `providedIn: 'root'`.
- Private `map()` method converts snake_case GoData to camelCase model.
- List methods accept optional filter, return `Observable<PaginatedResponse<T>>`.
- CRUD methods: `list`, `getById`, `create`, `update`, `delete`.
- Image methods: `updateImage`, `resolveImageUrl`.
- Auth-protected calls use `{ withCredentials: true }`.
- `JsendEnvelope<T>` interface for typing API responses.

### Environment configuration
- `src/environments/environment.ts` for development.
- `src/environments/environment.prod.ts` for production.
- `angular.json` has `fileReplacements` for production builds.
- `apiBaseUrl` is empty string for production (same origin), `http://localhost:8080` for dev.

### Component patterns
- `@Component` with `standalone: true`.
- `inject()` for dependency injection (not constructor injection).
- `signal()` for mutable state, `computed()` for derived state.
- `OnInit` for data loading.
- `forkJoin` for parallel API calls with `error` handler in subscribe.
- Signals passed to templates with `()` invocation: `[prop]="mySignal()"`.
- Image `loading="lazy"` on all non-hero images.
- `(error)="onImageError($event)"` handler sets `/not-found.png` as fallback.

#### Mutation blocking pattern (CREATE / UPDATE / DELETE / user-triggered search)

Every component method that triggers a mutation or a user-initiated search request **must** use a loading signal to prevent duplicate calls:

1. **Declare the flag**: `loading = signal(false);` (or `saving` in form dialogs).
2. **Disable the button in HTML**: `[disabled]="loading()"` on the triggering button.
3. **Early return**: at the top of the method, `if (this.loading()) return;`.
4. **Set before call**: `this.loading.set(true);`.
5. **Guaranteed reset**: `this.loading.set(false)` must run on success AND failure.

For Observables use `finalize(() => this.loading.set(false))`. For async/await use `try/catch/finally`.

```typescript
async guardar() {
  if (this.loading()) return;
  this.loading.set(true);
  try {
    await this.service.create(data);
    // success
  } catch (e) {
    // error
  } finally {
    this.loading.set(false);
  }
}
```

```html
<p-button [loading]="loading()" [disabled]="loading()" (onClick)="guardar()" />
```

This applies to all form dialog `save()` methods, list page `confirmDelete()` methods, and any button-triggered search/action.

### Routing
- Routes in `app.routes.ts`:
  - `/` — landing page
  - `/search` — catalog search
  - `/login` — auth page
  - `/register` — registration page
  - `/admin` — admin layout (guarded), children:
    - `/admin/dashboard`
    - `/admin/products` (requires `product:view`)
    - `/admin/bundles` (requires `bundle:view`)
    - `/admin/orders` (requires `order:view`)
    - `/admin/staff` (requires `staff:view`)
- English route names, English UI vocabulary.
- Auth routes skip store shell (header/footer).

### Auth
- PASETO v2.local tokens via HTTP-only cookies.
- `authInterceptor` handles 401 → refresh → retry. Skips auth endpoints (`/api/v1/auth/login`, `/refresh`, `/register/*`, `/forgot-password`, `/reset-password`).
- `AuthStore` manages user state with signals: `currentUser`, `permissions`, `isAuthenticated`, `isLoaded`, `expiresAt`.
- `AuthStore` has `hasPermission(code)` and `hasAnyPermission(...codes)` for RBAC checks, `isExpiringSoon()` for refresh timing.
- `withCredentials: true` on all authenticated requests.
- Guards: `adminGuard` (checks specific admin permission list), `permissionGuard(code)` (single permission), `authGuard` (tries session restore via `me()`).
- Directive: `hasPermission` for conditional rendering in templates.
- `API_BASE_URL` injection token is defined in `pages/auth-page/auth-api-go.service.ts`, not in `core/services/`.
- `AuthApiService` handles login, logout, refresh, me, and multi-step registration (start → verify-email → complete).
- `initializeAuth()` factory in `core/auth/auth-init.ts` runs as `APP_INITIALIZER` to restore session on app boot.

#### Session auto-expiration
- `expiresAt` is persisted in `localStorage` (key `lcdpc_expires_at`) after each login/refresh/me call.
- On app boot, `auth-init.ts` checks localStorage first: if stored `expiresAt` is in the past, it clears the session immediately without making a network request.
- AuthStore schedules a `setTimeout` 30s before the actual expiry to auto-clear the session and redirect to `/login`. The timer is reset on every token refresh.
- If the user is on a protected route when the timer fires, guards redirect to login because `isAuthenticated()` flips to false.
- `clear()` always removes the localStorage key and cancels the pending timer.

### Stores (`core/stores/`)
- Domain stores manage read-only data caches with signals.
- `CategoryStore` — loads categories once, provides `categoryMap`, `categoryOptions`, `filterOptions`, `getCategoryName(id)`.
- Pattern: `signal()` for data, `computed()` for derived state, `load()` with dedup (`loaded` flag).
- Used by both `pages/` and `shared/` components.

### Config page pattern (`pages/admin/config/`)
- Section-based admin page navigated via `?section=` query param.
- Two groups: `rbac` (profiles, roles, resources) and `inventario` (categories, price-categories, measurement-units).
- Permission-gated visibility per group.
- Each section is a standalone component in `config/sections/`.
- Sections that manage entities use a table + form dialog pattern.
- RBAC section manages three entities (resources, roles, profiles) with nested assignment dialogs (assign resource→role, assign role→profile).

### Form dialog pattern
- Reusable dialog components with `@Input() visible`, `@Input() item/entity`, `@Output() saved`, `@Output() closed`.
- Implements `OnChanges` to reset/populate form on visibility change.
- `isEditMode` getter checks if `item` input is set.
- `saving` signal for loading state during save.
- Calls parent `saved.emit()` on success, parent reloads list and shows toast.
- Inline templates for simple dialogs (categories, price-categories, measurement-units, classifications, staff).
- Separate HTML templates for complex dialogs (products, bundles, orders).

#### Nested dialog navigation pattern
- When a dialog opens a second dialog (e.g., detail → items), the second dialog must have a `@Output() back` event.
- The "Volver" button emits `back` and closes itself; the parent handler reopens the first dialog.
- Footer uses a split layout: `.footer-left` (back) and `.footer-right` (close + primary actions).
- Style the footer with `:host ::ng-deep .p-dialog-footer { display: flex; justify-content: space-between; }`.

```html
<ng-template pTemplate="footer">
  <div class="footer-left">
    <p-button label="Volver" icon="pi pi-arrow-left" severity="secondary" (onClick)="goBack()" />
  </div>
  <div class="footer-right">
    <p-button label="Cerrar" severity="secondary" (onClick)="close()" />
    @if (isEditable) {
      <p-button label="Guardar Cambios" ... (onClick)="save()" />
    }
  </div>
</ng-template>
```
```typescript
@Output() back = new EventEmitter<void>();
protected goBack(): void {
  this.visibleChange.emit(false);
  this.back.emit();
}
```

#### Form dialog styling standards
- Dialog padding-top: always add `paddingTop: '20px'` to dialog `[style]` so the first floatlabel is visible.
- Floatlabel inputs: every `p-floatlabel` input must have `placeholder=" "` (space) so PrimeNG detects pre-filled values via `ngModel`.
- Vertical gap: `.form-fields` uses `gap: 1.75rem` between fields for comfortable label spacing.

### Admin CRUD page pattern
- Each admin page: list component + form dialog component.
- List component injects: `AuthStore` (permissions), domain API service, `CategoryStore` (if needed), `ConfirmationService`, `MessageService`.
- Permission signals: `canCreate`, `canUpdate`, `canDelete` via `computed()` + `authStore.hasPermission()`.
- Table data loaded via signal, with `loadItems(event)` for pagination.
- Filters: component properties + `applyFilters()` method.
- Delete: `confirmDelete()` using PrimeNG `ConfirmationService`.
- Toast messages via `MessageService` (Spanish: "Exito", "Error").
- All `ConfirmationService` and `MessageService` provided locally in component `providers: []`.
- **PrimeNG 20 Toast**: The `detail` property of `MessageService.add()` renders HTML by default — do NOT use `escape: false` (that property does not exist in `ToastMessageOptions`). Just write HTML directly in the `detail` string. Example: `detail: 'Texto <a class="link" href="javascript:void(0)">enlace</a>'`.

#### Pagination pattern (PrimeNG lazy table)
All paginated list pages must follow the products page pattern — **never** use an external `<p-paginator>` outside `<p-table>`:
- `p-table` must have `[lazy]="true" [paginator]="true" [rows]="pageSize" (onLazyLoad)="loadItems($event)"` — the paginator lives inside the table.
- `pageSize` is a constant (`const pageSize = 10`), not a signal.
- `loadItems(event)` receives `{ first, rows }` from the table's `onLazyLoad` event, computes `offset = event.first`, `limit = event.rows`.
- `totalCount` is a signal populated from `res.totalCount`.
- When filters change, `applyFilters()` calls `loadItems({ first: 0, rows: this.pageSize })` to reset to page 1.
- No `<p-paginator>` is rendered separately; the table handles pagination UI natively.

### Order status flow (frontend)
- Frontend mirrors backend in `ORDER_STATUS_TRANSITIONS` (`core/models/order.model.ts`).
- Terminal statuses: `REJECTED_BY_VALIDATION`, `DELIVERY_FAILED`, `COMPLETED`, `CANCELLED_BY_CUSTOMER`.
- Status transitions managed in `orders-page.component.ts` with a dialog.
- Button visibility rules:
  - **Cambiar estado**: hidden when status is terminal OR when `ORDER_STATUS_TRANSITIONS[status]` is empty.
  - **Eliminar**: hidden when status is NOT `PENDING_REVIEW` (only initial status can be deleted).

#### Order dialog architecture

The orders page has a **three-dialog chain**:

1. **Detail Dialog** (`order-detail-dialog`) — read-only overview of the order (ID, status tag, branch, total, notes, history). Uses `ORDER_STATUS_LABELS` and `ORDER_STATUS_SEVERITY` maps for all status tags. Eye button (`pi pi-eye`) next to the Items label opens the items dialog.

2. **Items Dialog** (`order-items-dialog`) — specialized dialog for viewing and editing order products. Behavior depends on order status:
   - **Read-only mode** (non-editable statuses): shows items as a static list (product name, quantity, price, subtotal).
   - **Editable mode** (`PENDING_REVIEW` / `UNDER_REVIEW` via `ORDER_EDITABLE_STATUSES`): full edit capabilities — add/remove products, change quantity, change price, edit notes.

3. **Status Change Dialog** — inline `<p-dialog>` in the orders page for changing order status.

#### Flow: orders table → detail → items

```
orders-page (table)
  ├── viewDetail(order) → opens detail dialog
  │     └── viewItems (eye button) → fetches full order via getById(), opens items dialog
  │           ├── back (Volver) → closes items dialog, reopens detail dialog
  │           └── saved → closes items dialog, reloads list, reopens detail dialog with fresh data
  ├── openStatusDialog(order) → opens status change dialog
  └── confirmDelete(order) → confirmation → delete
```

#### Detail dialog component contract

- `@Input() visible: boolean` + `@Output() visibleChange`
- `@Input() order: Order | null`
- `@Input() branches: { id: string; name: string }[]`
- `@Output() viewItems = new EventEmitter<void>()` — emitted when eye button is clicked
- `ngOnChanges`: loads `history` from `orderApi.getHistory()` when dialog opens
- Eye button is placed inline next to the Items value using `.detail-item-items > .detail-item-row` flex layout, NOT in the header area

#### Items dialog component contract

- `@Input() visible: boolean` + `@Output() visibleChange`
- `@Input() order: Order | null`
- `@Input() branches: { id: string; name: string }[]`
- `@Output() saved = new EventEmitter<void>()` — emitted after successful update
- `@Output() back = new EventEmitter<void>()` — emitted when "Volver" is clicked
- `isEditable` getter derived from `ORDER_EDITABLE_STATUSES[order.status]`
- `ngOnChanges`: loads products (filtered by branch) and price categories when dialog opens
- Uses `MessageService` with `ToastModule` import and `<p-toast />` in template
- Footer layout: left side has "Volver", right side has "Cerrar" + "Guardar Cambios" (editable only)

#### Order Items Dialog — editable features

When `ORDER_EDITABLE_STATUSES[order.status]` is true:

- **Remove product**: marks item as `isRemoved` (existing) or splices from array (new). Stock is released on save.
- **Change quantity**: `p-inputNumber` with stock validation. Effective blocked = `stockBlocked - originalQuantity + newQuantity`. Backend validates `stockAvailable >= qty` and `stockBlocked + qty <= stock`.
- **Change price**: `p-select` dropdown populated from `priceApi.listByProductId()` showing available prices per price category (e.g., "Oferta — $5.00", "Mayorista — $3.50"). Falls back to `p-inputNumber` when no price options exist. Uses `optionValue="id"` (price record UUID) to avoid confusion when values are identical.
- **Add product**: pushes new `EditableOrderItem` with `isNew: true`, `originalQuantity: 0`. Product select filtered by branch.
- **Edit notes**: `p-floatlabel` textarea bound to `notes`.

#### Price select standard pattern

Any component that lets the user pick a product price (order creation, order editing, etc.) **must** follow this pattern:

**Data model per item:**
```typescript
interface PriceOption {
  label: string;   // "CategoryName — $X.XX"
  id: string;      // product_branch_prices record UUID
  amount: number;  // numeric price value
}

// On each item row:
priceOptions: PriceOption[];
selectedPriceId: string | null;
```

**Dependencies:**
- `PriceApiService` — `listByProductId(productId)` returns `ProductBranchPrice[]`
- `PriceCategoryApiService` — `list()` returns `PriceCategory[]` (loaded once per dialog open, stored in signal)

**Method: `loadPricesForItem(index, productId, autoSelectFirst?)`:**
1. Calls `priceApi.listByProductId(productId)`
2. Maps result through `formatPriceOptions(prices)` to build `PriceOption[]`
3. Assigns to `items[index].priceOptions`
4. If `autoSelectFirst` or `unitPrice === 0`: sets `unitPrice = first.amount`, `selectedPriceId = first.id`
5. Otherwise: tries to match existing `unitPrice` to an option by amount; falls back to first option

**Method: `formatPriceOptions(prices)`:**
```typescript
private formatPriceOptions(prices: ProductBranchPrice[]): PriceOption[] {
  return prices.map((p) => {
    const cat = this.priceCategories().find((c) => c.id === p.priceCategoryId);
    const name = cat?.name ?? 'Precio base';
    return { label: `${name} — $${p.amount.toFixed(2)}`, id: p.id, amount: p.amount };
  });
}
```

**Method: `onPriceOptionSelect(index, id)`:**
```typescript
protected onPriceOptionSelect(index: number, id: string): void {
  const option = this.form.items[index].priceOptions.find((o) => o.id === id);
  if (option) {
    this.form.items[index].selectedPriceId = id;
    this.form.items[index].unitPrice = option.amount;
  }
}
```

**Template (grid column 3 — `.price-field`):**
```html
<p-select class="price-field" [options]="item.priceOptions"
          [(ngModel)]="item.selectedPriceId" optionLabel="label" optionValue="id"
          (onChange)="onPriceOptionSelect(i, $event.value)"
          [disabled]="item.priceOptions.length === 0"
          placeholder="Precio" appendTo="body" />
```

**On product select:** reset `unitPrice = 0`, `priceOptions = []`, `selectedPriceId = null`, then call `loadPricesForItem(index, productId, true)`.

**Key rules:**
- `optionValue="id"` (not `amount`) — avoids confusion when multiple categories share the same price value
- `appendTo="body"` — prevents dropdown clipping inside dialog
- `[disabled]="item.priceOptions.length === 0"` — when no product is selected, prices are still loading, or the product has no registered prices, the select stays disabled and no manual price entry is allowed (forces prices to be registered in `product_branch_prices`)
- Label format: `"{categoryName} — ${amount.toFixed(2)}"` — never show raw UUIDs or amounts without context
- Both `order-items-dialog` and `order-form-dialog` (creation) must use this identical pattern

#### Validation matrix

| Check | Frontend (UI warning) | Backend (reject) |
|---|---|---|
| Empty items list | ✅ | ✅ |
| Quantity ≤ 0 | ✅ | ✅ (implicit) |
| Duplicate products | ✅ | ❌ |
| Stock available < quantity | ✅ (visual) | ✅ (hard reject) |
| Stock blocked + qty > stock | ✅ (visual) | ✅ (hard reject) |
| Order not editable | ✅ (hide save button) | ✅ (hard reject) |

#### Centralized status maps (`core/models/order.model.ts`)

All status-related maps are in one file for reuse:

- `ORDER_STATUS_LABELS` — maps status codes to Spanish display labels
- `ORDER_STATUS_SEVERITY` — maps statuses to PrimeNG tag severities (`warn`, `info`, `success`, `danger`, `secondary`)
- `ORDER_TERMINAL_STATUSES` — statuses with no further transitions
- `ORDER_EDITABLE_STATUSES` — statuses that allow item editing (`PENDING_REVIEW`, `UNDER_REVIEW`)
- `ORDER_STATUS_TRANSITIONS` — full state machine defining allowed next statuses

### Bundle status flow (frontend)
- `Draft` → `Published` (via `bundleApi.publish()`)
- `Published` → `Paused` (via `bundleApi.pause()`)
- Status displayed with PrimeNG `p-tag`: Draft=info, Published=success, Paused=warn.

## Look and feel standards

### Color palette
- `--page-bg: #e8e8e8` — page background
- `--surface: #fffdf3` — card/surface background
- `--surface-strong: #f5cb00` — primary yellow accent
- `--accent: #f7931a` — orange accent
- `--accent-2: #f5cb00` — secondary yellow
- `--text-strong: #121212` — primary text
- `--text-soft: #2f2f2f` — secondary text
- `--border: #e2a94f` — border color

### Typography
- Display: `Anton` — bold headlines, hero titles
- Body: `Poppins` — all body text, UI elements
- Script: `Pacifico` — decorative accents only
- Font weights: 400 (regular), 500 (medium), 600 (semibold), 700 (bold), 800 (extrabold)

### PrimeNG theme
- Preset: `Aura` (configured in `app.config.ts`)
- Prefix: `p`
- Dark mode: disabled (`darkModeSelector: 'none'`)
- Components used: `p-card`, `p-tag`, `p-button`, `p-select`, `p-inputgroup`, `p-inputtext`, `p-stepper`, `p-floatlabel`, `p-checkbox`, `p-password`, `p-inputotp`, `p-carousel`, `p-datepicker`

### Layout patterns
- Page background: radial gradient with accent colors + linear gradient
- Cards: white surface with `var(--shadow)` shadow
- Category pills: `p-button` with `severity="primary"` (active) or `severity="secondary"` + `[outlined]` (inactive)
- Product grid: CSS grid with responsive columns
- Hero: full-width carousel with overlay text
- Mobile nav: fixed bottom bar with icon buttons

### UI rules
- All buttons must have `cursor: pointer` on hover. PrimeNG buttons may need explicit `cursor: pointer` in `::ng-deep` styles.
- Be precise with layout — align related elements (e.g. action buttons) using sub-grids, not by mixing unrelated elements in the same grid row.
- All dialogs must have `[draggable]="false"` — they should not be draggable.

### Form dialog template (canonical structure)

Use `category-form-dialog.component.ts` as the reference for all simple form dialogs. Key structure:

```typescript
@Component({
  selector: 'app-<entity>-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, FloatLabelModule,
  ],
  template: `
    <p-dialog [header]="isEditMode ? 'Editar <Entity>' : 'Nuevo <Entity>'"
              [visible]="visible" (visibleChange)="visibleChange.emit($event)"
              [modal]="true" [dismissableMask]="true" [draggable]="false" [style]="{width: 'min(500px, 95vw)'}"
              (onHide)="close()">
      <div class="form-fields" [style]="{paddingTop: '20px'}">
        <div class="field">
          <p-floatlabel>
            <input pInputText id="name" [(ngModel)]="form.name"
                   [class.ng-invalid]="submitted && !form.name" style="width: 100%" placeholder=" " />
            <label for="name">Nombre *</label>
          </p-floatlabel>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" (onClick)="close()"></p-button>
        <p-button [label]="isEditMode ? 'Guardar Cambios' : 'Crear <Entity>'"
                  icon="pi pi-check" [loading]="saving()" (onClick)="save()"></p-button>
      </ng-template>
    </p-dialog>
  `,
  styles: [`.form-fields { display: flex; flex-direction: column; gap: 1.75rem; } .field { display: flex; flex-direction: column; gap: 0.25rem; }`],
})
```

Rules derived from this template:
- `@Input() visible` + `@Output() visibleChange` for dialog visibility (two-way binding).
- `@Input() entity: Entity | null = null` — null means create mode.
- `@Output() saved` + `@Output() closed` for parent communication.
- `saving` signal, `submitted` boolean, `form` typed as `CreateRequest & { extra? }`.
- `isEditMode` getter checks `entity !== null`.
- `ngOnChanges` resets form when dialog opens (checks `changes['entity'] || changes['visible']`).
- `save()` validates → sets saving → calls create or update → emits `saved`.
- `close()` emits `closed` (parent handles visibility).
- `emptyForm()` private method returns default form values.
- Always use `p-floatlabel` with `placeholder=" "` (space) on inputs.
- Dialog `[style]` must include `paddingTop: '20px'` so the first floatlabel is visible.
- Use `InputTextModule` only (no `InputNumberModule` unless numeric fields are required).

### Branch-scoped access in form dialogs

When a form dialog creates/edits an entity with `branch_id` (products, bundles, staff), the branch selector must be conditionally hidden for users without `view:branch:all`:

- Inject `AuthStore`.
- Add a `canViewAllBranches = computed(() => this.authStore.hasPermission('view:branch:all'))` signal.
- Add a `userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null)` signal.
- Load branches via `branchApi.listAdmin()` instead of `branchApi.list()`.
- In `ngOnChanges`, when opening for **create** mode and `canViewAllBranches()` is false, auto-set `form.branch_id = userBranchId()`.
- In the template, wrap the branch `<p-select>` in `@if (canViewAllBranches())`.

```typescript
// Component additions
private readonly authStore = inject(AuthStore);
protected readonly canViewAllBranches = computed(() => this.authStore.hasPermission('view:branch:all'));
protected readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);

// In ngOnChanges create branch:
if (!this.canViewAllBranches() && this.userBranchId()) {
  this.form.branch_id = this.userBranchId();
}
```

```html
<!-- Template branch selector -->
@if (canViewAllBranches()) {
  <div class="field">
    <p-select id="branch" [options]="branches()" [(ngModel)]="form.branch_id"
              optionLabel="label" optionValue="value" placeholder="Sucursal"
              [showClear]="true" [style]="{'width':'100%'}" />
  </div>
}
```

### Branch-scoped access in list pages

Admin list pages for products, bundles, orders, and staff must auto-filter by branch when the user lacks `view:branch:all`:

- Inject `AuthStore` and add `canViewAllBranches` / `userBranchId` computed signals.
- In the `loadItems` method, append `filters.branch_id = this.userBranchId()` when `canViewAllBranches()` is false.
- Branch dropdowns in filters should use `branchApi.listAdmin()`.
- Do not rely solely on the frontend — the backend also enforces this filter in each list handler.

```typescript
// In list component
private readonly authStore = inject(AuthStore);
protected readonly canViewAllBranches = computed(() => this.authStore.hasPermission('view:branch:all'));
protected readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);

loadItems(event: TableLazyLoadEvent): void {
  const filters: ProductListFilter = {};
  if (!this.canViewAllBranches() && this.userBranchId()) {
    filters.branch_id = this.userBranchId();
  }
  this.productApi.list({ ...filters, limit: event.rows ?? this.pageSize, offset: event.first ?? 0 })
    .subscribe({ ... });
}
```

### Image handling (frontend)
- All product/bundle images: `loading="lazy"` attribute
- Fallback: `/not-found.png` via `(error)="onImageError($event)"`
- API images resolved via `resolveImageUrl(img)` which prepends `apiBaseUrl`

### System Config (frontend)
- **Model**: `core/models/system-config.model.ts` — `SystemConfig`, `CreateSystemConfigRequest`, `UpdateSystemConfigRequest`
- **Service**: `core/services/system-config-api.service.ts` — CRUD (authenticated) + public endpoints + `resolveImageUrl()`
- **Store**: `core/stores/system-config.store.ts` — caches `logoUrl`, `iconUrl`, `pageName`, `title`, `showPrice`; loads from public endpoints on boot; sets `document.title` and favicon dynamically
- **Initializer**: `core/stores/system-config-init.ts` — `APP_INITIALIZER` factory that calls `store.load()`
- **Config page section**: `pages/admin/config/sections/system-config-section.component.ts` — table with create/edit/activate actions
- **Form dialog**: `pages/admin/config/sections/system-config-form-dialog.component.ts` — supports create + edit modes, file upload for logo/icon, `p-floatlabel` with `placeholder=" "`
- **Header**: `shared/header/header.component.ts` — uses `SystemConfigStore` for dynamic logo and page name
- Route guard updated to allow `system_config:view` for config page access

### Branch Store (centralized branch selection)

- **Store**: `core/stores/branch.store.ts` — `branches` list, `selectedBranchId` signal
- `load()` loads branches from API, auto-selects first branch
- `selectBranch()` changes active branch
- Used by `App` component (header) and `LandingPageComponent` (product filtering)

### Cart Store (`core/stores/cart.store.ts`)

Purely client-side cart with localStorage persistence. Makes **zero API calls** — no server sync, no checkout flow.

#### Data model
```typescript
interface CartItem {
  id: string;
  name: string;
  imageUrl: string;
  price: number;
  branchId: string | null;
  quantity: number;
  stockAvailable: number;
}
```

#### Signals
| Signal | Type | Description |
|---|---|---|
| `_items` | `signal<CartItem[]>` | Private state, initialized from `loadCart()` |
| `items` (readonly) | `Signal<CartItem[]>` | Public read-only items |
| `totalItems` | `computed` | `_items().length` — counts **distinct items**, not sum of quantities |
| `totalQuantity` | `computed` | Sum of all item quantities (actual units) |
| `totalPrice` | `computed` | Sum of `price * quantity` across all items |

#### Methods
| Method | Behavior |
|---|---|
| `addItem(item, quantity=1)` | Branch-scoped: if cart has items from a different branch, replaces entire cart. Otherwise adds qty to existing item or appends new. Calls `saveCart()`. |
| `removeItem(id)` | Filters out by id. Saves. |
| `updateQuantity(id, qty)` | If qty <= 0, removes. Otherwise updates. Saves. |
| `increment(id)` | +1 to item quantity. Saves. |
| `decrement(id)` | -1; removes if new qty <= 0. Saves. |
| `clear()` | Empties cart, removes localStorage key. |

#### Persistence
- Key: `lcdpc_cart`
- Format: JSON array of `CartItem`
- Loaded on store init via `signal<CartItem[]>(loadCart())`
- Saved after every mutation via `saveCart()`
- No expiry — persists indefinitely until manually cleared

#### Known issues / incomplete state
- **No auth integration**: cart survives logout, not user-specific
- **`totalItems` counts distinct products**: 10 units of one product = count of 1 (badge shows 1)
- **`totalQuantity`** is available for accurate count but badge uses `totalItems`

#### Integration points
- **Header** (`shared/header/`): receives `@Input() cartCount`, emits `@Output() cartClick` — opens cart dialog
- **App** (`app.html`): passes `cartStore.totalItems()` to header, shows second badge in mobile nav, wires `(cartClick)` to `openCartDialog()`
- **CartDialogComponent** (`shared/cart-dialog/`): full cart UI — items list, quantity controls, stock warnings, clear, buy
- **LandingPageComponent**: calls `cartStore.addItem()` when user clicks "Agregar" on a product, passes `stockAvailable` and real price
- **CatalogComponent** (`shared/catalog/`): presentational — emits `addToCart`, `increment`, `decrement` events, no cart store direct access
- **BranchStore**: branchId from selected product is passed to cart; branch conflict enforcement in `addItem()` prevents mixing branches

#### Add-to-cart flow
1. User clicks +/- in CatalogComponent → emits `increment`/`decrement` → `LandingPageComponent` updates local `product.quantity` signal
2. User clicks "Añadir al Carrito" → CatalogComponent emits `addToCart(productId)` → `LandingPageComponent.addToCart()` finds product, calls `cartStore.addItem()` with `{ id, name, imageUrl, price, branchId, stockAvailable }` and local quantity
3. CartStore checks branch conflict → saves to localStorage
4. Product local quantity resets to 1

### Cart Dialog (`shared/cart-dialog/`)

Complex dialog (separate `.ts` + `.html` + `.scss` files) for cart management and order creation.

#### Files
- `cart-dialog.component.ts` — component class with buy logic
- `cart-dialog.component.html` — PrimeNG `p-dialog` template
- `cart-dialog.component.scss` — styles

#### Behavior
- Opens when user clicks cart icon in header or mobile nav (`showCartDialog` signal in `App`)
- Shows list of cart items with image, name, stock info, quantity controls, remove button
- Stock warning: items where `quantity > stockAvailable` are highlighted in red
- Quantity +/- buttons: increment disabled when `quantity >= stockAvailable`
- "Vaciar Carrito" clears all items
- "Comprar" creates order via `OrderApiService.create()`
- After successful order creation, calls `cartStore.notifyOrderCreated()` so the catalog reloads (via `lastOrderCreatedAt` signal)

#### Buy flow
1. Validates user is authenticated — if not, redirects to `/login`
2. Validates no stock issues (`hasStockIssues` computed signal)
3. Builds `CreateOrderRequest` with `branch_id`, `client_user_id`, items (all `item_type: "product"`)
4. Calls `orderApi.create(req)`
5. On success: clears cart, shows success toast, closes dialog, notifies catalog to reload
6. On error: shows error toast (e.g., `INSUFFICIENT_STOCK`)

### Catalog branch filtering

- `LandingPageComponent` uses `effect()` to react to `branchStore.selectedBranchId()` changes
- When branch changes, reloads products and bundles with `branch_id` filter
- `CatalogComponent` emits `increment(productId)`, `decrement(productId)`, `addToCart(productId)` events
- Cart-to-catalog reload: effect watches `cartStore.lastOrderCreatedAt()` alongside branch changes to reload products
