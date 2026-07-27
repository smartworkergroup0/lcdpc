import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnChanges, Output, signal, SimpleChanges, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { FloatLabelModule } from 'primeng/floatlabel';
import { TooltipModule } from 'primeng/tooltip';
import { StepperModule } from 'primeng/stepper';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AuthStore } from '../../../../core/auth/auth.store';
import { BranchApiService } from '../../../../core/services/branch-api.service';
import { ProductApiService } from '../../../../core/services/product-api.service';
import { PriceApiService } from '../../../../core/services/price-api.service';
import { PriceCategoryApiService } from '../../../../core/services/price-category-api.service';
import { PersonApiService } from '../../../../core/services/person-api.service';
import { OrderApiService } from '../../../../core/services/order-api.service';
import { ExternalAssistantApiService } from '../../../../core/services/external-assistant-api.service';
import { AssistantSessionStore } from '../../../../core/stores/assistant-session.store';
import { AssistantOrder } from '../../../../core/models/external-assistant.model';
import { Product } from '../../../../core/models/product.model';
import { PriceCategory } from '../../../../core/models/price-category.model';
import { ProductBranchPrice } from '../../../../core/models/price.model';

interface PriceOption {
  label: string;
  id: string;
  amount: number;
}

interface ParsedItem {
  quantity: number;
  productName: string;
  unitPrice: number;
  subtotal: number;
}

interface OrderItemForm {
  product_id: string;
  quantity: number;
  unit_price: number;
  priceOptions: PriceOption[];
  selectedPriceId: string | null;
  matchedFrom: string | null;
}

@Component({
  selector: 'app-assistant-accept-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    SelectModule, InputNumberModule, InputTextModule, FloatLabelModule,
    TooltipModule, StepperModule, ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './assistant-accept-dialog.component.html',
  styleUrl: './assistant-accept-dialog.component.scss',
})
export class AssistantAcceptDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() order: AssistantOrder | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();

  private readonly authStore = inject(AuthStore);
  private readonly branchApi = inject(BranchApiService);
  private readonly productApi = inject(ProductApiService);
  private readonly priceApi = inject(PriceApiService);
  private readonly priceCategoryApi = inject(PriceCategoryApiService);
  private readonly personApi = inject(PersonApiService);
  private readonly orderApi = inject(OrderApiService);
  private readonly assistantApi = inject(ExternalAssistantApiService);
  private readonly sessionStore = inject(AssistantSessionStore);
  private readonly messageService = inject(MessageService);

  protected readonly saving = signal(false);
  protected readonly branches = signal<{ label: string; value: string }[]>([]);
  protected readonly products = signal<Product[]>([]);
  protected readonly priceCategories = signal<PriceCategory[]>([]);
  protected readonly parsedItems = signal<ParsedItem[]>([]);
  protected readonly canViewAllBranches = computed(() => this.authStore.hasPermission('view:branch:all'));
  protected readonly userBranchId = computed(() => this.authStore.currentUser()?.branchId ?? null);

  protected activeStep = 0;
  protected selectedBranchId = '';
  protected items: OrderItemForm[] = [];
  protected submitted = false;

  protected get total(): number {
    return this.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  }

  protected get hasItems(): boolean {
    return this.items.length > 0 && this.items.some((i) => i.product_id && i.quantity > 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.order) {
      this.activeStep = 0;
      this.submitted = false;
      this.saving.set(false);
      this.selectedBranchId = '';
      this.items = [];

      this.loadBranches();
      this.priceCategoryApi.list().subscribe({
        next: (cats) => this.priceCategories.set(cats),
      });

      this.parsedItems.set(this.parseSummary(this.order.summary));
    }
  }

  private loadBranches(): void {
    this.branchApi.listAdmin().subscribe({
      next: (branches) => {
        this.branches.set(branches.map((b) => ({ label: b.storeName, value: b.id })));
        if (!this.canViewAllBranches() && this.userBranchId()) {
          this.selectedBranchId = this.userBranchId()!;
          this.onBranchSelected();
        }
      },
    });
  }

  protected onBranchSelected(): void {
    if (!this.selectedBranchId) return;
    this.productApi.list({ branch_id: this.selectedBranchId, limit: 100 }).subscribe({
      next: (res) => {
        this.products.set(res.items.filter((p) => p.isActive));
        this.buildItemsFromParsed();
      },
    });
  }

  protected goToItems(): void {
    if (!this.selectedBranchId) return;
    this.activeStep = 1;
  }

  protected goToBranch(): void {
    this.activeStep = 0;
  }

  private buildItemsFromParsed(): void {
    const parsed = this.parsedItems();
    const prods = this.products();
    const newItems: OrderItemForm[] = [];

    for (const pi of parsed) {
      const normalizedName = pi.productName.trim().toUpperCase();
      const match = prods.find((p) => p.name.trim().toUpperCase() === normalizedName);

      if (match) {
        newItems.push({
          product_id: match.productId,
          quantity: pi.quantity,
          unit_price: 0,
          priceOptions: [],
          selectedPriceId: null,
          matchedFrom: pi.productName,
        });
        this.loadPricesForItem(newItems.length - 1, match.productId, true);
      } else {
        newItems.push({
          product_id: '',
          quantity: pi.quantity,
          unit_price: 0,
          priceOptions: [],
          selectedPriceId: null,
          matchedFrom: pi.productName,
        });
      }
    }

    this.items = newItems;
  }

  protected onProductSelect(index: number): void {
    const item = this.items[index];
    if (!item.product_id) return;
    item.unit_price = 0;
    item.priceOptions = [];
    item.selectedPriceId = null;
    this.loadPricesForItem(index, item.product_id, true);
  }

  private loadPricesForItem(index: number, productId: string, autoSelectFirst = false): void {
    this.priceApi.listByProductId(productId).subscribe({
      next: (prices) => {
        if (index < this.items.length) {
          const opts = this.formatPriceOptions(prices);
          this.items[index].priceOptions = opts;
          if (autoSelectFirst || this.items[index].unit_price === 0) {
            const first = opts[0];
            if (first) {
              this.items[index].unit_price = first.amount;
              this.items[index].selectedPriceId = first.id;
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
    const option = this.items[index].priceOptions.find((o) => o.id === id);
    if (option) {
      this.items[index].selectedPriceId = id;
      this.items[index].unit_price = option.amount;
    }
  }

  protected addItem(): void {
    this.items.push({
      product_id: '',
      quantity: 1,
      unit_price: 0,
      priceOptions: [],
      selectedPriceId: null,
      matchedFrom: null,
    });
  }

  protected removeItem(index: number): void {
    this.items.splice(index, 1);
  }

  protected getProductName(productId: string): string {
    return this.products().find((p) => p.productId === productId)?.name ?? '';
  }

  protected async save(): Promise<void> {
    this.submitted = true;
    if (!this.selectedBranchId || !this.order) return;
    const validItems = this.items.filter((i) => i.product_id && i.quantity > 0);
    if (validItems.length === 0) return;
    if (this.saving()) return;

    this.saving.set(true);

    try {
      const identification = this.order.identification;
      let personId: string | null = null;

      // 1. Try to find person by document
      try {
        const person = await this.personApi.getByDocument(identification).toPromise();
        if (person) {
          personId = person.id;
        }
      } catch {
        // Person not found — get lead data from SmartWorker
      }

      // 2. If person not found, get lead from SmartWorker and create person
      if (!personId) {
        let phone = '';
        let address = this.order.address;

        const sessionId = this.sessionStore.selectedSessionId();
        if (sessionId) {
          try {
            const lead = await this.assistantApi.getLeadByIdentification(sessionId, identification).toPromise();
            if (lead) {
              phone = lead.phone || '';
              address = lead.address || address;
            }
          } catch {
            // Lead not found — use order data
          }
        }

        const person = await this.personApi.createClient({
          name: this.order.customerName,
          identityDocument: identification,
          whatsappPhone: phone,
          fullAddress: address,
        }).toPromise();

        if (person) {
          personId = person.id;
        }
      }

      if (!personId) {
        throw new Error('No se pudo crear o encontrar la persona');
      }

      // 3. Create order
      const orderResult = await this.orderApi.create({
        branch_id: this.selectedBranchId,
        person_id: personId,
        smartworker_order_id: this.order.id,
        notes: `Importado desde SmartWorker - Orden #${this.order.id}`,
        items: validItems.map((i) => ({
          item_type: 'product',
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
      }).toPromise();

      // 4. Notify SmartWorker
      const sessionId = this.sessionStore.selectedSessionId();
      if (sessionId) {
        try {
          await this.assistantApi.acceptOrder(sessionId, this.order.id).toPromise();
        } catch {
          // If SmartWorker notification fails, log but don't fail the whole flow
          this.messageService.add({
            severity: 'warn',
            summary: 'Advertencia',
            detail: 'La orden se creo localmente pero no se pudo notificar a SmartWorker',
          });
        }
      }

      this.messageService.add({ severity: 'success', summary: 'Exito', detail: 'Orden creada correctamente' });
      this.saved.emit();
    } catch (err: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: err?.message || 'No se pudo crear la orden',
      });
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    this.visibleChange.emit(false);
  }

  private parseSummary(summary: string): ParsedItem[] {
    if (!summary) return [];

    const items: ParsedItem[] = [];
    const lines = summary.split('\n').filter((l) => l.trim().length > 0);

    for (const line of lines) {
      const match = line.match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(.+?)\s*\(\$\s*([\d.]+)\s*c\/u\s*\)\s*=\s*\$([\d.]+)/);
      if (match) {
        items.push({
          quantity: parseFloat(match[1]),
          productName: match[2].trim(),
          unitPrice: parseFloat(match[3]),
          subtotal: parseFloat(match[4]),
        });
      }
    }

    return items;
  }
}
