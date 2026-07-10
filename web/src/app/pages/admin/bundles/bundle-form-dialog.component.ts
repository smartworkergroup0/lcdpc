import { Component, EventEmitter, inject, Input, OnChanges, Output, signal, SimpleChanges, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { FloatLabelModule } from 'primeng/floatlabel';
import { CheckboxModule } from 'primeng/checkbox';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { forkJoin, of, switchMap } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { Bundle, BundleItemRequest, CreateBundleRequest } from '../../../core/models/bundle.model';
import { Product } from '../../../core/models/product.model';
import { BundleApiService } from '../../../core/services/bundle-api.service';
import { ProductApiService } from '../../../core/services/product-api.service';
import { BranchApiService } from '../../../core/services/branch-api.service';
import { PriceCategoryApiService } from '../../../core/services/price-category-api.service';
import { CategoryStore } from '../../../core/stores/category.store';

interface BundleItemForm extends BundleItemRequest {
}

interface BundlePriceForm {
  priceCategoryId: string | null;
  amount: number | null;
}

@Component({
  selector: 'app-bundle-form-dialog',
  standalone: true,
  imports: [
    FormsModule, ButtonModule, DialogModule, ToastModule,
    InputTextModule, InputNumberModule, SelectModule, FloatLabelModule, CheckboxModule
  ],
  providers: [MessageService],
  templateUrl: './bundle-form-dialog.component.html',
  styleUrl: './bundle-form-dialog.component.scss'
})
export class BundleFormDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() bundle: Bundle | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private readonly authStore = inject(AuthStore);
  private readonly bundleApi = inject(BundleApiService);
  private readonly productApi = inject(ProductApiService);
  private readonly branchApi = inject(BranchApiService);
  private readonly priceCategoryApi = inject(PriceCategoryApiService);
  private readonly messageService = inject(MessageService);
  readonly categoryStore = inject(CategoryStore);

  protected readonly saving = signal(false);
  protected readonly canViewAllBranches = computed(() => this.authStore.hasPermission('view:branch:all'));
  protected readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);
  protected readonly products = signal<Product[]>([]);
  protected readonly branches = signal<{ label: string; value: string }[]>([]);
  protected readonly priceCategories = signal<{ id: string; name: string }[]>([]);
  protected readonly bundlePricesForm = signal<BundlePriceForm[]>([]);
  protected submitted = false;
  protected imageFile: File | null = null;
  protected imagePreview: string | null = null;
  protected priceError: string | null = null;
  private retailCategoryId: string | null = null;

  protected form = this.emptyForm();

  protected readonly combosCategoryId = computed(() => {
    const cat = this.categoryStore.categories().find((c) => c.code === 'combos');
    return cat?.categoryId ?? null;
  });

  protected get isEditMode(): boolean {
    return this.bundle !== null;
  }

  protected get availableProducts() {
    return this.products().filter((p) => p.isActive);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.loadProducts();
      this.loadBranches();
      this.loadPriceCategories();
      if (this.bundle) {
        this.form = {
          code: this.bundle.code,
          name: this.bundle.name,
          category_id: this.combosCategoryId(),
          branch_id: this.bundle.branchId,
          stock: this.bundle.stock,
          blocks_product_stock: this.bundle.blocksProductStock,
          items: (this.bundle.items ?? []).map((i) => ({
            product_id: i.productId,
            quantity: i.quantity,
          })),
        };
        this.imagePreview = this.bundleApi.resolveImageUrl(this.bundle.img);
        this.loadBundlePrices();
      } else {
        this.form = this.emptyForm();
        if (!this.canViewAllBranches() && this.userBranchId()) {
          this.form.branch_id = this.userBranchId();
        }
        this.form.category_id = this.combosCategoryId();
        this.imagePreview = null;
        this.bundlePricesForm.set([]);
      }
      this.submitted = false;
      this.imageFile = null;
      this.retailCategoryId = null;
    }
  }

  private loadBranches(): void {
    this.branchApi.listAdmin().subscribe({
      next: (branches) => this.branches.set([
        { label: 'Todas', value: 'all' },
        ...branches.map((b) => ({ label: b.storeName, value: b.id })),
      ]),
    });
  }

  private loadProducts(): void {
    this.productApi.list({ limit: 100 }).subscribe({
      next: (res) => this.products.set(res.items),
    });
  }

  private loadPriceCategories(): void {
    this.priceCategoryApi.list().subscribe({
      next: (categories) => {
        this.priceCategories.set(categories.map((c) => ({ id: c.id, name: c.name })));
        const retail = categories.find((c) => c.code === 'retail');
        this.retailCategoryId = retail?.id ?? null;

        if (!this.isEditMode) {
          if (retail && this.bundlePricesForm().length === 0) {
            this.bundlePricesForm.set([{ priceCategoryId: retail.id, amount: null }]);
          }
        }
      },
    });
  }

  private loadBundlePrices(): void {
    if (!this.bundle) return;
    this.bundleApi.listPrices(this.bundle.bundleId).subscribe({
      next: (prices) => {
        this.bundlePricesForm.set(prices.map((p) => ({
          priceCategoryId: p.priceCategoryId,
          amount: p.amount,
        })));
      },
    });
  }

  addItem(): void {
    this.form.items.push({
      product_id: '',
      quantity: 1,
    });
  }

  removeItem(index: number): void {
    this.form.items.splice(index, 1);
  }

  addPrice(): void {
    this.bundlePricesForm.update((prices) => [...prices, { priceCategoryId: null, amount: null }]);
  }

  removePrice(index: number): void {
    if (index === 0) return;
    this.bundlePricesForm.update((prices) => prices.filter((_, i) => i !== index));
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.imageFile = input.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        this.imagePreview = reader.result as string;
      };
      reader.readAsDataURL(this.imageFile);
    }
  }

  removeImage(): void {
    this.imageFile = null;
    this.imagePreview = null;
  }

  save(): void {
    this.submitted = true;
    if (!this.form.name || !this.form.code || this.form.items.length === 0) {
      return;
    }
    if (this.form.items.some((i) => !i.product_id || i.quantity <= 0)) {
      return;
    }

    this.priceError = this.validatePrices();
    if (this.priceError) {
      return;
    }

    this.saving.set(true);

    const req = {
      code: this.form.code,
      name: this.form.name,
      items: this.form.items.map((i) => ({
        product_id: i.product_id,
        quantity: i.quantity,
      })),
      prices: this.bundlePricesForm()
        .filter((p): p is BundlePriceForm & { amount: number } => p.amount != null && p.amount > 0)
        .map((p) => ({
          price_category_id: p.priceCategoryId,
          amount: p.amount,
        })),
      category_id: this.form.category_id ?? undefined,
      branch_id: this.form.branch_id ?? undefined,
      stock: this.form.stock ?? undefined,
      blocks_product_stock: this.form.blocks_product_stock,
    };

    if (!this.isEditMode && this.form.branch_id === 'all') {
      this.createForAllBranches(req);
      return;
    }

    const operation = this.isEditMode
      ? this.bundleApi.update(this.bundle!.bundleId, req, this.imageFile ?? undefined)
      : this.bundleApi.create(req, this.imageFile ?? undefined);

    operation.subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.emit();
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message ?? 'No se pudo guardar el combo';
        this.messageService.add({ severity: 'error', summary: 'Error', detail: this.mapBackendError(msg) });
      },
    });
  }

  private createForAllBranches(baseReq: CreateBundleRequest): void {
    const realBranches = this.branches().filter((b) => b.value !== 'all');
    let completed = 0;
    const total = realBranches.length;

    const finish = () => {
      this.saving.set(false);
      this.saved.emit();
    };

    if (total === 0) {
      finish();
      return;
    }

    for (const branch of realBranches) {
      const branchReq = { ...baseReq, branch_id: branch.value };

      this.bundleApi.create(branchReq, this.imageFile ?? undefined).subscribe({
        next: () => {
          completed++;
          if (completed === total) finish();
        },
        error: () => {
          completed++;
          if (completed === total) finish();
        },
      });
    }
  }

  close(): void {
    this.closed.emit();
  }

  private emptyForm() {
    return {
      code: '',
      name: '',
      category_id: null as string | null,
      branch_id: null as string | null,
      stock: undefined as number | undefined,
      blocks_product_stock: false,
      items: [] as BundleItemForm[],
    };
  }

  private validatePrices(): string | null {
    const prices = this.bundlePricesForm().filter((p) => p.amount != null && p.amount > 0);

    if (this.retailCategoryId) {
      const hasRetail = prices.some((p) => p.priceCategoryId === this.retailCategoryId);
      if (!hasRetail) {
        return 'El precio Minorista (retail) es obligatorio';
      }
    }

    const seen = new Set<string>();
    for (const p of prices) {
      const key = p.priceCategoryId ?? '__none__';
      if (seen.has(key)) {
        return 'No puede haber dos precios con la misma categoria';
      }
      seen.add(key);
    }
    return null;
  }

  private mapBackendError(msg: string): string {
    if (msg.startsWith('PRODUCT_NOT_FOUND:')) {
      const ids = msg.replace('PRODUCT_NOT_FOUND: ', '');
      return `Producto(s) no encontrado(s): ${ids}`;
    }
    if (msg.startsWith('BUNDLE_STOCK_EXCEEDS_CHAIN:')) {
      const match = msg.match(/max (\d+), requested (\d+)/);
      if (match) {
        return `El stock del combo (${match[2]}) supera el stock disponible de los productos (maximo ${match[1]})`;
      }
      return 'El stock del combo supera el stock disponible de los productos';
    }
    if (msg.includes('duplicate key') && msg.includes('code')) {
      return 'Ya existe un combo con ese codigo';
    }
    return msg;
  }
}
