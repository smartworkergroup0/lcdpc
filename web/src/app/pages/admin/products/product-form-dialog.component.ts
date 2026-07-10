import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, computed, inject, signal, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { FloatLabelModule } from 'primeng/floatlabel';
import { forkJoin, of, switchMap, concatMap } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { Product, CreateProductRequest } from '../../../core/models/product.model';
import { CreatePriceRequest } from '../../../core/models/price.model';
import { CreateConversionFactorRequest } from '../../../core/models/conversion-factor.model';
import { MeasurementUnit } from '../../../core/models/measurement-unit.model';
import { ProductApiService } from '../../../core/services/product-api.service';
import { PriceApiService } from '../../../core/services/price-api.service';
import { ConversionFactorApiService } from '../../../core/services/conversion-factor-api.service';
import { BranchApiService } from '../../../core/services/branch-api.service';
import { BrandApiService } from '../../../core/services/brand-api.service';
import { MeasurementUnitApiService } from '../../../core/services/measurement-unit-api.service';
import { PriceCategoryApiService } from '../../../core/services/price-category-api.service';
import { CategoryStore } from '../../../core/stores/category.store';
import { SystemConfigStore } from '../../../core/stores/system-config.store';

type PriceRow = {
  price_category_id: string | null;
  amount: number | null;
};

type ConversionRow = {
  from_unit_id: string | null;
  to_unit_id: string | null;
  amount: number | null;
  main: boolean;
};

@Component({
  selector: 'app-product-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, InputNumberModule, SelectModule,
    CheckboxModule, FloatLabelModule
  ],
  templateUrl: './product-form-dialog.component.html',
  styleUrl: './product-form-dialog.component.scss'
})
export class ProductFormDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() product: Product | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private readonly authStore = inject(AuthStore);
  private readonly systemConfigStore = inject(SystemConfigStore);
  private readonly productApi = inject(ProductApiService);
  private readonly priceApi = inject(PriceApiService);
  private readonly conversionApi = inject(ConversionFactorApiService);
  private readonly branchApi = inject(BranchApiService);
  private readonly brandApi = inject(BrandApiService);
  private readonly unitApi = inject(MeasurementUnitApiService);
  private readonly priceCategoryApi = inject(PriceCategoryApiService);
  readonly categoryStore = inject(CategoryStore);

  protected readonly saving = signal(false);
  protected readonly canViewAllBranches = computed(() => this.authStore.hasPermission('view:branch:all'));
  protected readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);
  protected readonly branches = signal<{ label: string; value: string }[]>([]);
  protected readonly brands = signal<{ label: string; value: string }[]>([]);
  protected readonly allUnits = signal<MeasurementUnit[]>([]);
  protected readonly measurementUnits = signal<{ label: string; value: string }[]>([]);
  protected readonly priceCategories = signal<{ label: string; value: string }[]>([]);

  protected submitted = false;
  protected imageFile: File | null = null;
  protected imagePreview: string | null = null;
  protected conversionError: string | null = null;
  protected priceError: string | null = null;

  private previousClassificationId: string | null = null;
  private retailCategoryId: string | null = null;

  protected form: CreateProductRequest = this.emptyForm();
  protected prices: PriceRow[] = [this.emptyPrice()];
  protected conversions: ConversionRow[] = [];

  protected get hasBaseUnit(): boolean {
    return !!this.form.base_unit_id;
  }

  protected get baseUnitAsOptions(): { label: string; value: string }[] {
    const baseId = this.form.base_unit_id;
    if (!baseId) return [];
    const unit = this.allUnits().find((u) => u.id === baseId);
    if (!unit) return [];
    return [{
      label: unit.symbol ? `${unit.name} (${unit.symbol})` : unit.name,
      value: unit.id,
    }];
  }

  protected get conversionUnitOptions(): { label: string; value: string }[] {
    const baseId = this.form.base_unit_id;
    if (!baseId) return [];
    const units = this.allUnits();
    const baseUnit = units.find((u) => u.id === baseId);
    if (!baseUnit || !baseUnit.classificationId) return [];
    return units
      .filter((u) => u.classificationId === baseUnit.classificationId && u.id !== baseId)
      .map((u) => ({
        label: u.symbol ? `${u.name} (${u.symbol})` : u.name,
        value: u.id,
      }));
  }

  protected get isEditMode(): boolean {
    return this.product !== null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.loadData();
      if (this.product) {
        this.form = {
          name: this.product.name,
          sku: this.product.sku,
          brand_id: this.product.brandId,
          category_id: this.product.categoryId,
          branch_id: this.product.branchId,
          base_unit_id: this.product.baseUnitId,
          stock: this.product.stock,
        };
        this.imagePreview = this.productApi.resolveImageUrl(this.product.img);
        this.loadExistingPricesAndConversions();
      } else {
        this.form = this.emptyForm();
        if (!this.canViewAllBranches() && this.userBranchId()) {
          this.form.branch_id = this.userBranchId();
        }
        this.prices = [this.emptyPrice()];
        this.conversions = [];
        this.imagePreview = null;
        this.previousClassificationId = null;
      }
      this.submitted = false;
      this.imageFile = null;
      this.conversionError = null;
      this.retailCategoryId = null;
    }
  }

  private loadData(): void {
    forkJoin({
      branches: this.branchApi.listAdmin(),
      brands: this.brandApi.list(),
      units: this.unitApi.list(),
      categories: this.priceCategoryApi.list(),
    }).subscribe({
      next: ({ branches, brands, units, categories }) => {
        this.branches.set([
          { label: 'Todas', value: 'all' },
          ...branches.map((b) => ({ label: b.storeName, value: b.id })),
        ]);
        this.brands.set(brands.map((b) => ({ label: b.name, value: b.id })));
        this.allUnits.set(units);
        this.measurementUnits.set(units.map((u) => ({
          label: u.symbol ? `${u.name} (${u.symbol})` : u.name,
          value: u.id,
        })));
        this.priceCategories.set(categories.map((c) => ({ label: c.name, value: c.id })));

        const retail = categories.find((c) => c.code === 'retail');
        this.retailCategoryId = retail?.id ?? null;

        if (!this.isEditMode) {
          const retail = categories.find((c) => c.code === 'retail');
          if (retail && this.prices.length === 1 && !this.prices[0].price_category_id) {
            this.prices[0].price_category_id = retail.id;
          }
        }
      },
    });
  }

  private getClassificationId(unitId: string | null | undefined): string | null {
    if (!unitId) return null;
    const unit = this.allUnits().find((u) => u.id === unitId);
    return unit?.classificationId ?? null;
  }

  private loadExistingPricesAndConversions(): void {
    if (!this.product) return;
    forkJoin({
      prices: this.priceApi.listByProductId(this.product.productId),
      conversions: this.conversionApi.listByProductId(this.product.productId),
    }).subscribe({
      next: ({ prices, conversions }) => {
        if (prices.length > 0) {
          this.prices = prices.map((p) => ({
            price_category_id: p.priceCategoryId,
            amount: p.amount,
          }));
        } else {
          this.prices = [this.emptyPrice()];
        }
        if (conversions.length > 0) {
          this.conversions = conversions.map((c) => ({
            from_unit_id: c.fromUnitId,
            to_unit_id: c.toUnitId,
            amount: c.amount,
            main: c.main,
          }));
        } else {
          this.conversions = [];
        }
        this.previousClassificationId = this.getClassificationId(this.product!.baseUnitId);
      },
    });
  }

  addPrice(): void {
    this.prices.push(this.emptyPrice());
  }

  removePrice(index: number): void {
    if (index === 0) return;
    this.prices.splice(index, 1);
  }

  addConversion(): void {
    const isFirst = this.conversions.length === 0;
    const conv = this.emptyConversion();
    if (isFirst && this.form.base_unit_id) {
      conv.from_unit_id = this.form.base_unit_id;
      conv.main = true;
    }
    this.conversions.push(conv);
    this.conversionError = null;
  }

  removeConversion(index: number): void {
    this.conversions.splice(index, 1);
    this.conversionError = null;
  }

  onBaseUnitChange(): void {
    const newClassificationId = this.getClassificationId(this.form.base_unit_id);
    const classificationChanged = newClassificationId !== this.previousClassificationId;

    if (this.conversions.length > 0) {
      if (classificationChanged) {
        this.conversions = [];
        this.conversionError = null;
      } else {
        const validUnits = new Set(this.conversionUnitOptions.map((u) => u.value));
        const invalid = this.conversions.filter(
          (c, i) => i > 0 && c.to_unit_id && !validUnits.has(c.to_unit_id)
        );
        if (invalid.length > 0) {
          this.conversionError = 'Algunos factores de conversion ya no son validos por el cambio de unidad base';
        }
      }
    }

    if (this.conversions.length > 0) {
      this.conversions[0].from_unit_id = this.form.base_unit_id ?? null;
    }

    this.previousClassificationId = newClassificationId;
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
    if (!this.form.name || !this.form.sku) {
      return;
    }

    if (this.form.stock != null && this.form.stock < 0 && !this.systemConfigStore.negativeStock()) {
      return;
    }

    const validPrices = this.prices.filter(
      (p) => p.amount != null && p.amount > 0
    );

    this.priceError = this.validatePrices(validPrices);
    if (this.priceError) {
      return;
    }

    const validConversions = this.conversions.filter(
      (c) => c.from_unit_id && c.to_unit_id && c.amount != null && c.amount > 0
    );

    this.conversionError = this.validateConversions(validConversions);
    if (this.conversionError) {
      return;
    }

    this.saving.set(true);

    const req: CreateProductRequest = {
      ...this.form,
      is_active: this.isEditMode ? this.product!.isActive : true,
    };

    if (!this.isEditMode && this.form.branch_id === 'all') {
      this.createForAllBranches(req, validPrices, validConversions);
      return;
    }

    const operation = this.isEditMode
      ? this.productApi.update(this.product!.productId, req, this.imageFile ?? undefined)
      : this.productApi.create(req, this.imageFile ?? undefined);

    operation.subscribe({
      next: (product) => {
        const afterDelete$ = this.isEditMode
          ? forkJoin([
              this.priceApi.listByProductId(product.productId),
              this.conversionApi.listByProductId(product.productId),
            ])
          : null;

        const createCalls$ = () => {
          const calls = [
            ...validPrices.map((p) => {
              const priceReq: CreatePriceRequest = {
                product_id: product.productId,
                price_category_id: p.price_category_id,
                amount: p.amount!,
              };
              return this.priceApi.create(priceReq);
            }),
            ...validConversions.map((c) => {
              const convReq: CreateConversionFactorRequest = {
                product_id: product.productId,
                from_unit_id: c.from_unit_id!,
                to_unit_id: c.to_unit_id!,
                amount: c.amount!,
                main: c.main,
              };
              return this.conversionApi.create(convReq);
            }),
          ];

          if (calls.length === 0) {
            this.saving.set(false);
            this.saved.emit();
            return;
          }

          forkJoin(calls).subscribe({
            next: () => {
              this.saving.set(false);
              this.saved.emit();
            },
            error: () => {
              this.saving.set(false);
              this.saved.emit();
            },
          });
        };

        if (afterDelete$) {
          afterDelete$.subscribe({
            next: ([existingPrices, existingConversions]) => {
              const deletes = [
                ...existingPrices.map((p) => this.priceApi.delete(p.id)),
                ...existingConversions.map((c) => this.conversionApi.delete(c.id)),
              ];
              if (deletes.length === 0) {
                createCalls$();
                return;
              }
              forkJoin(deletes).subscribe({
                next: () => createCalls$(),
                error: () => createCalls$(),
              });
            },
            error: () => createCalls$(),
          });
        } else {
          createCalls$();
        }
      },
      error: () => {
        this.saving.set(false);
      },
    });
  }

  private createForAllBranches(
    req: CreateProductRequest,
    validPrices: PriceRow[],
    validConversions: ConversionRow[]
  ): void {
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
      const branchReq: CreateProductRequest = { ...req, branch_id: branch.value };

      this.productApi.create(branchReq, this.imageFile ?? undefined).pipe(
        switchMap((product) =>
          this.createProductRelations(product, validPrices, validConversions)
        ),
      ).subscribe({
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

  private createProductRelations(
    product: Product,
    validPrices: PriceRow[],
    validConversions: ConversionRow[]
  ): import('rxjs').Observable<void> {
    const calls = [
      ...validPrices.map((p) => {
        const priceReq: CreatePriceRequest = {
          product_id: product.productId,
          price_category_id: p.price_category_id,
          amount: p.amount!,
        };
        return this.priceApi.create(priceReq);
      }),
      ...validConversions.map((c) => {
        const convReq: CreateConversionFactorRequest = {
          product_id: product.productId,
          from_unit_id: c.from_unit_id!,
          to_unit_id: c.to_unit_id!,
          amount: c.amount!,
          main: c.main,
        };
        return this.conversionApi.create(convReq);
      }),
    ];

    if (calls.length === 0) return of(undefined);

    return forkJoin(calls).pipe(switchMap(() => of(undefined)));
  }

  close(): void {
    this.closed.emit();
  }

  private emptyForm(): CreateProductRequest {
    return {
      name: '',
      sku: '',
      brand_id: '',
      category_id: null,
      branch_id: null,
      base_unit_id: null,
      stock: undefined,
    };
  }

  private emptyPrice(): PriceRow {
    return {
      price_category_id: null,
      amount: null,
    };
  }

  private emptyConversion(): ConversionRow {
    return {
      from_unit_id: null,
      to_unit_id: null,
      amount: null,
      main: false,
    };
  }

  private validatePrices(prices: PriceRow[]): string | null {
    if (this.retailCategoryId) {
      const hasRetail = prices.some((p) => p.price_category_id === this.retailCategoryId);
      if (!hasRetail) {
        return 'El precio Minorista (retail) es obligatorio';
      }
    }

    const seen = new Set<string>();
    for (const p of prices) {
      const key = p.price_category_id ?? '__none__';
      if (seen.has(key)) {
        return 'No puede haber dos precios con la misma categoria';
      }
      seen.add(key);
    }
    return null;
  }

  private validateConversions(conversions: ConversionRow[]): string | null {
    const valid = conversions.filter((c) => c.from_unit_id && c.to_unit_id && c.amount != null && c.amount > 0);
    for (let i = 0; i < valid.length; i++) {
      const c = valid[i];
      if (c.from_unit_id === c.to_unit_id) {
        return `Factor ${i + 1}: la unidad origen y destino deben ser diferentes`;
      }
    }

    for (let i = 0; i < valid.length; i++) {
      for (let j = i + 1; j < valid.length; j++) {
        const a = valid[i];
        const b = valid[j];
        if (a.from_unit_id === b.from_unit_id && a.to_unit_id === b.to_unit_id) {
          return `Factores ${i + 1} y ${j + 1}: factor duplicado (mismas unidades)`;
        }
        if (a.from_unit_id === b.to_unit_id && a.to_unit_id === b.from_unit_id) {
          return `Factores ${i + 1} y ${j + 1}: factor inverso duplicado`;
        }
      }
    }

    return null;
  }
}
