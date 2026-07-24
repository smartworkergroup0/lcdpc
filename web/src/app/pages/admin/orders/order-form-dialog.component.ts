import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnChanges, Output, signal, SimpleChanges, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { FloatLabelModule } from 'primeng/floatlabel';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { AuthStore } from '../../../core/auth/auth.store';
import { SystemConfigStore } from '../../../core/stores/system-config.store';
import { MeasurementUnitClassificationStore } from '../../../core/stores/measurement-unit-classification.store';
import { MeasurementUnitStore } from '../../../core/stores/measurement-unit.store';
import { MeasurementUnitApiService } from '../../../core/services/measurement-unit-api.service';
import { AppUser } from '../../../core/models/user.model';
import { Person } from '../../../core/models/person.model';
import { DOCUMENT_TYPE_OPTIONS } from '../../../core/models/document-type.model';
import { UserApiService } from '../../../core/services/user-api.service';
import { PersonApiService } from '../../../core/services/person-api.service';
import { OrderApiService } from '../../../core/services/order-api.service';
import { ProductApiService } from '../../../core/services/product-api.service';
import { PriceApiService } from '../../../core/services/price-api.service';
import { PriceCategoryApiService } from '../../../core/services/price-category-api.service';
import { Product } from '../../../core/models/product.model';
import { MeasurementUnit } from '../../../core/models/measurement-unit.model';
import { PriceCategory } from '../../../core/models/price-category.model';
import { ProductBranchPrice } from '../../../core/models/price.model';
import { CreateOrderRequest } from '../../../core/models/order.model';
import { ClientFormDialogComponent } from './client-form-dialog.component';

interface PriceOption {
  label: string;
  id: string;
  amount: number;
}

interface OrderItemForm {
  product_id: string;
  quantity: number;
  unit_price: number;
  priceOptions: PriceOption[];
  selectedPriceId: string | null;
}

@Component({
  selector: 'app-order-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, InputNumberModule, SelectModule, FloatLabelModule, TooltipModule,
    TagModule, ClientFormDialogComponent,
  ],
  templateUrl: './order-form-dialog.component.html',
  styleUrl: './order-form-dialog.component.scss'
})
export class OrderFormDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() branches: { id: string; name: string }[] = [];

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();

  private readonly authStore = inject(AuthStore);
  private readonly systemConfigStore = inject(SystemConfigStore);
  private readonly classificationStore = inject(MeasurementUnitClassificationStore);
  private readonly unitStore = inject(MeasurementUnitStore);
  private readonly unitApi = inject(MeasurementUnitApiService);
  private readonly userApi = inject(UserApiService);
  private readonly personApi = inject(PersonApiService);
  private readonly orderApi = inject(OrderApiService);
  private readonly productApi = inject(ProductApiService);
  private readonly priceApi = inject(PriceApiService);
  private readonly priceCategoryApi = inject(PriceCategoryApiService);

  protected readonly saving = signal(false);
  protected readonly canViewAllBranches = computed(() => this.authStore.hasPermission('view:branch:all'));
  protected readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);
  protected readonly canCreateClient = computed(() =>
    this.authStore.hasPermission('client:create') && this.authStore.hasPermission('client:update')
  );
  protected readonly products = signal<Product[]>([]);
  protected readonly allUnits = signal<MeasurementUnit[]>([]);
  protected readonly priceCategories = signal<PriceCategory[]>([]);
  protected readonly DOCUMENT_TYPE_OPTIONS = DOCUMENT_TYPE_OPTIONS;
  protected submitted = false;

  protected form = this.emptyForm();

  protected documentType = 'V';
  protected documentNumber = '';
  protected selectedUser = signal<AppUser | null>(null);
  protected selectedPerson = signal<Person | null>(null);
  protected userSearchError = signal('');
  protected searchingUser = signal(false);
  protected personNotFound = signal(false);
  protected showClientDialog = signal(false);

  protected get total(): number {
    return this.form.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  }

  protected get totalItems(): number {
    return this.form.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  protected get duplicateProductIds(): Set<string> {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const item of this.form.items) {
      if (item.product_id && seen.has(item.product_id)) {
        dupes.add(item.product_id);
      }
      seen.add(item.product_id);
    }
    return dupes;
  }

  protected get hasDuplicates(): boolean {
    return this.duplicateProductIds.size > 0;
  }

  protected get hasStockIssues(): boolean {
    if (this.systemConfigStore.negativeStock()) return false;
    return this.form.items.some((item) => {
      if (!item.product_id) return false;
      const product = this.products().find((p) => p.productId === item.product_id);
      if (!product) return false;
      return product.stockBlocked + item.quantity > product.stock;
    });
  }

  protected isDuplicateItem(index: number): boolean {
    const item = this.form.items[index];
    return !!item.product_id && this.duplicateProductIds.has(item.product_id);
  }

  protected isOverStock(index: number): boolean {
    if (this.systemConfigStore.negativeStock()) return false;
    const item = this.form.items[index];
    if (!item.product_id) return false;
    const product = this.products().find((p) => p.productId === item.product_id);
    if (!product) return false;
    return product.stockBlocked + item.quantity > product.stock;
  }

  protected getItemStockInfo(index: number): string {
    const item = this.form.items[index];
    if (!item.product_id) return '';
    const product = this.products().find((p) => p.productId === item.product_id);
    if (!product) return '';
    const available = product.stock - product.stockBlocked;
    const sym = this.unitStore.getMeasurementUnitSymbol(product.baseUnitId);
    return `Disponible: ${available} ${sym} | Bloqueado: ${product.stockBlocked} ${sym} | Total: ${product.stock} ${sym}`;
  }

  protected getItemMaxFractionDigits(index: number): number {
    const item = this.form.items[index];
    if (!item?.product_id) return 0;
    const product = this.products().find((p) => p.productId === item.product_id);
    if (!product?.baseUnitId) return 0;
    const unit = this.allUnits().find((u) => u.id === product.baseUnitId);
    if (!unit?.classificationId) return 0;
    return this.classificationStore.canDecimalStock(unit.classificationId) ? 3 : 0;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.form = this.emptyForm();
      this.selectedUser.set(null);
      this.selectedPerson.set(null);
      this.documentType = 'V';
      this.documentNumber = '';
      this.userSearchError.set('');
      this.searchingUser.set(false);
      this.personNotFound.set(false);
      this.showClientDialog.set(false);
      this.products.set([]);
      this.submitted = false;

      this.classificationStore.load();
      this.unitStore.load();
      this.unitApi.list().subscribe({
        next: (units) => this.allUnits.set(units),
      });

      this.priceCategoryApi.list().subscribe({
        next: (cats) => this.priceCategories.set(cats),
      });

      if (!this.canViewAllBranches() && this.userBranchId()) {
        this.form.branch_id = this.userBranchId()!;
        this.loadProducts(this.form.branch_id);
      }
    }
  }

  protected onBranchChange(): void {
    this.form.items = [];
    if (this.form.branch_id) {
      this.loadProducts(this.form.branch_id);
    }
  }

  private loadProducts(branchId: string): void {
    this.productApi.list({ branch_id: branchId, limit: 100 }).subscribe({
      next: (res) => this.products.set(res.items.filter((p) => p.isActive)),
    });
  }

  protected searchByDocument(): void {
    const doc = `${this.documentType}${this.documentNumber}`.trim();
    if (!doc || !this.documentNumber.trim()) return;

    this.searchingUser.set(true);
    this.userSearchError.set('');
    this.selectedUser.set(null);
    this.selectedPerson.set(null);
    this.personNotFound.set(false);
    this.form.client_user_id = '';
    this.form.person_id = '';

    this.userApi.getByDocument(doc).subscribe({
      next: (user) => {
        this.selectedUser.set(user);
        this.form.person_id = user.personId ?? '';
        this.searchingUser.set(false);
      },
      error: () => {
        this.personApi.getByDocument(doc).subscribe({
          next: (person) => {
            this.selectedPerson.set(person);
            this.form.person_id = person.id;
            this.searchingUser.set(false);
          },
          error: () => {
            this.personNotFound.set(true);
            this.searchingUser.set(false);
          },
        });
      },
    });
  }

  protected clearUser(): void {
    this.selectedUser.set(null);
    this.selectedPerson.set(null);
    this.form.client_user_id = '';
    this.form.person_id = '';
    this.documentType = 'V';
    this.documentNumber = '';
    this.userSearchError.set('');
    this.personNotFound.set(false);
  }

  protected openCreateClient(): void {
    this.showClientDialog.set(true);
  }

  protected onClientBack(): void {
    this.showClientDialog.set(false);
  }

  protected onClientCreated(person: Person): void {
    this.showClientDialog.set(false);
    this.selectedPerson.set(person);
    this.selectedUser.set(null);
    this.form.person_id = person.id;
    this.form.client_user_id = '';
    this.personNotFound.set(false);
  }

  protected get hasClientSelected(): boolean {
    return !!this.form.person_id || !!this.form.client_user_id;
  }

  protected onProductSelect(index: number): void {
    const item = this.form.items[index];
    if (!item.product_id) return;
    item.unit_price = 0;
    item.priceOptions = [];
    item.selectedPriceId = null;
    this.loadPricesForItem(index, item.product_id, true);
  }

  private loadPricesForItem(index: number, productId: string, autoSelectFirst = false): void {
    this.priceApi.listByProductId(productId).subscribe({
      next: (prices) => {
        if (index < this.form.items.length) {
          const opts = this.formatPriceOptions(prices);
          this.form.items[index].priceOptions = opts;
          if (autoSelectFirst || this.form.items[index].unit_price === 0) {
            const first = opts[0];
            if (first) {
              this.form.items[index].unit_price = first.amount;
              this.form.items[index].selectedPriceId = first.id;
            }
          } else {
            const match = opts.find((o) => o.amount === this.form.items[index].unit_price);
            this.form.items[index].selectedPriceId = match?.id ?? opts[0]?.id ?? null;
            if (!match && opts.length > 0) {
              this.form.items[index].unit_price = opts[0].amount;
              this.form.items[index].selectedPriceId = opts[0].id;
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

  protected onPriceOptionSelect(index: number, id: string): void {
    const option = this.form.items[index].priceOptions.find((o) => o.id === id);
    if (option) {
      this.form.items[index].selectedPriceId = id;
      this.form.items[index].unit_price = option.amount;
    }
  }

  protected addItem(): void {
    this.form.items.push({ product_id: '', quantity: 1, unit_price: 0, priceOptions: [], selectedPriceId: null });
  }

  protected removeItem(index: number): void {
    this.form.items.splice(index, 1);
  }

  protected getProductName(productId: string): string {
    return this.products().find((p) => p.productId === productId)?.name ?? '';
  }

  protected save(): void {
    this.submitted = true;
    if (!this.form.branch_id || !this.hasClientSelected) return;
    if (this.form.items.length === 0) return;
    if (this.form.items.some((i) => !i.product_id || i.quantity <= 0)) return;
    if (this.hasDuplicates) return;
    if (this.hasStockIssues) return;

    this.saving.set(true);

    const req: CreateOrderRequest = {
      branch_id: this.form.branch_id,
      person_id: this.form.person_id || undefined,
      client_user_id: this.form.client_user_id || undefined,
      notes: this.form.notes,
      items: this.form.items.map((i) => ({
        item_type: 'product',
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
      })),
    };

    this.orderApi.create(req).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.emit();
      },
      error: () => {
        this.saving.set(false);
      },
    });
  }

  protected close(): void {
    this.visibleChange.emit(false);
  }

  private emptyForm() {
    return {
      branch_id: '',
      client_user_id: '',
      person_id: '',
      notes: '',
      items: [] as OrderItemForm[],
    };
  }
}
