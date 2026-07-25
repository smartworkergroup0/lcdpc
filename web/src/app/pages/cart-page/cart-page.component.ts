import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { AuthStore } from '../../core/auth/auth.store';
import { DOCUMENT_TYPE_OPTIONS } from '../../core/models/document-type.model';
import { CartItem, CartStore } from '../../core/stores/cart.store';
import { OrderApiService } from '../../core/services/order-api.service';
import { PersonApiService } from '../../core/services/person-api.service';
import { SystemConfigStore } from '../../core/stores/system-config.store';
import { Person } from '../../core/models/person.model';

@Component({
  selector: 'app-cart-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputGroupModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    ToggleSwitchModule,
    TagModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './cart-page.component.html',
  styleUrl: './cart-page.component.scss',
})
export class CartPageComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly cartStore = inject(CartStore);
  protected readonly systemConfigStore = inject(SystemConfigStore);
  private readonly orderApi = inject(OrderApiService);
  private readonly personApi = inject(PersonApiService);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);

  ngOnInit(): void {
    window.scrollTo(0, 0);
  }

  protected readonly items = this.cartStore.items;
  protected readonly totalPrice = this.cartStore.totalPrice;
  protected readonly totalQuantity = this.cartStore.totalQuantity;
  protected readonly buying = signal(false);
  protected readonly contactName = signal('');
  protected readonly phone = signal('');
  protected readonly orderNotes = signal('');
  protected readonly fullAddress = signal('');
  protected readonly isLegalPerson = signal(false);
  protected readonly documentType = signal('V');
  protected readonly documentNumber = signal('');
  protected readonly searchingPerson = signal(false);
  protected readonly personLoaded = signal(false);
  protected readonly person = signal<Person | null>(null);
  protected readonly personSearchError = signal('');
  protected readonly DOCUMENT_TYPE_OPTIONS = DOCUMENT_TYPE_OPTIONS;

  protected readonly isEmpty = computed(() => this.items().length === 0);
  protected readonly hasStockIssues = computed(() =>
    !this.systemConfigStore.negativeStock() && this.items().some((item) => item.quantity > item.stockAvailable)
  );
  protected readonly documentTypeOptions = computed(() =>
    this.isLegalPerson()
      ? DOCUMENT_TYPE_OPTIONS
      : DOCUMENT_TYPE_OPTIONS.filter((opt) => opt.value === 'V' || opt.value === 'E')
  );
  protected readonly isExistingPerson = computed(() => this.person() !== null);
  protected readonly personFieldsVisible = computed(() => this.personLoaded());
  protected readonly showClearSearchButton = computed(() => this.personLoaded());
  protected readonly canSearchPerson = computed(() => this.documentNumber().trim().length > 0 && !this.searchingPerson());
  protected readonly canConfirm = computed(() =>
    this.isPersonFormValid() &&
    !this.searchingPerson() &&
    !this.buying() &&
    !this.hasStockIssues() &&
    !this.isEmpty()
  );

  protected readonly branchId = computed(() => {
    const items = this.items();
    if (items.length === 0) return null;
    return items[0].branchId;
  });

  protected onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = '/not-found.png';
  }

  protected clearCart(): void {
    this.cartStore.clear();
  }

  protected removeItem(id: string): void {
    this.cartStore.removeItem(id);
  }

  protected onPersonTypeChange(value: boolean): void {
    this.isLegalPerson.set(value);
    const allowed = this.documentTypeOptions().map((opt) => opt.value);
    if (!allowed.includes(this.documentType())) {
      this.documentType.set(allowed[0] ?? 'V');
    }
    this.personLoaded.set(false);
    this.personSearchError.set('');
    this.person.set(null);
    this.contactName.set('');
    this.phone.set('');
    this.fullAddress.set('');
  }

  protected onDocumentTypeChange(value: string): void {
    this.documentType.set(value);
    this.personLoaded.set(false);
    this.personSearchError.set('');
    this.person.set(null);
    this.contactName.set('');
    this.phone.set('');
    this.fullAddress.set('');
  }

  protected clearPersonSearch(): void {
    this.documentType.set(this.getDefaultDocumentType());
    this.documentNumber.set('');
    this.personSearchError.set('');
    this.personLoaded.set(false);
    this.person.set(null);
    this.contactName.set('');
    this.phone.set('');
    this.fullAddress.set('');
    this.searchingPerson.set(false);
  }

  protected updateDocumentNumber(value: string): void {
    this.documentNumber.set(this.normalizeDigits(value, 9));
    this.personLoaded.set(false);
    this.personSearchError.set('');
    this.person.set(null);
    this.contactName.set('');
    this.phone.set('');
    this.fullAddress.set('');
  }

  protected allowOnlyDigits(event: KeyboardEvent): void {
    const allowedKeys = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (allowedKeys.includes(event.key) || event.ctrlKey || event.metaKey) return;
    if (!/^\d$/.test(event.key)) event.preventDefault();
  }

  protected sanitizeDigitsPaste(event: ClipboardEvent): void {
    const pastedText = event.clipboardData?.getData('text') ?? '';
    const digitsOnly = this.normalizeDigits(pastedText, 9);
    if (digitsOnly.length !== pastedText.length) {
      event.preventDefault();
    }
    this.documentNumber.set(digitsOnly);
    this.personLoaded.set(false);
    this.personSearchError.set('');
    this.person.set(null);
    this.contactName.set('');
    this.phone.set('');
    this.fullAddress.set('');
  }

  protected searchPerson(): void {
    const documentNumber = this.documentNumber().trim();
    if (!documentNumber) return;

    const document = `${this.documentType()}${documentNumber}`;
    this.personSearchError.set('');
    this.personLoaded.set(false);

    this.searchingPerson.set(true);

    this.personApi.getByDocument(document).subscribe({
      next: (person: Person) => {
        this.applyPerson(person);
        this.personLoaded.set(true);
        this.searchingPerson.set(false);
        this.personSearchError.set('');
      },
      error: (err: unknown) => {
        this.person.set(null);
        this.contactName.set('');
        this.phone.set('');
        this.fullAddress.set('');
        this.searchingPerson.set(false);
        this.personLoaded.set(true);
        if (typeof err === 'object' && err !== null && 'status' in err && (err as { status?: number }).status === 404) {
          this.personSearchError.set('No se encontró la persona. Completá los datos para crearla.');
          return;
        }
        this.personSearchError.set('No se pudo buscar la persona.');
      },
    });
  }

  protected enableEditing(): void {
    this.personLoaded.set(true);
  }

  protected onNameInput(value: string): void {
    this.contactName.set(value);
  }

  protected onPhoneInput(value: string): void {
    this.phone.set(this.normalizeDigits(value, 30));
  }

  protected onOrderNotesInput(value: string): void {
    this.orderNotes.set(value);
  }

  protected onAddressInput(value: string): void {
    this.fullAddress.set(value);
  }

  // Botones +/- siempre step de 1. Input p-inputNumber permite 0.1 via teclado.
  // canDecimalStock: input min=0.01, step=0.1, maxFractionDigits=2.
  // Botones no consideran canDecimalStock — siempre +1/-1.
  protected increment(id: string): void {
    const item = this.items().find((i) => i.id === id);
    if (item && item.quantity < item.stockAvailable) {
      this.cartStore.increment(id);
    }
  }

  protected decrement(id: string): void {
    this.cartStore.decrement(id);
  }

  protected onQuantityInputChange(id: string, value: number | null): void {
    if (value === null || value === undefined) return;
    const item = this.items().find(i => i.id === id);
    if (!item) return;
    const min = item.canDecimalStock ? 0.01 : 1;
    const max = item.stockAvailable;
    this.cartStore.updateQuantity(id, Math.max(min, Math.min(value, max)));
  }

  isOverStock(item: CartItem): boolean {
    return !this.systemConfigStore.negativeStock() && item.quantity > item.stockAvailable;
  }

  protected buy(): void {
    if (this.isEmpty()) return;

    if (this.hasStockIssues()) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Hay productos con cantidad mayor al stock disponible',
      });
      return;
    }

    const branchId = this.branchId();
    if (!branchId) return;

    if (!this.isPersonFormValid()) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Buscá o completá los datos de la persona antes de confirmar el pedido.',
      });
      return;
    }

    this.buying.set(true);

    const personPayload = this.personPayload();
    const currentUser = this.authStore.currentUser();
    this.orderApi.create({
      branch_id: branchId,
      ...(currentUser ? { client_user_id: currentUser.id } : {}),
      ...(this.person() ? { person_id: this.person()!.id } : {}),
      person_name: personPayload.name,
      person_identity_document: personPayload.identityDocument,
      person_whatsapp_phone: personPayload.whatsappPhone,
      person_full_address: personPayload.fullAddress,
      notes: this.orderNotes(),
      items: this.items().map((item) => ({
        item_type: item.itemType,
        ...(item.itemType === 'bundle' ? { bundle_id: item.id } : { product_id: item.id }),
        quantity: item.quantity,
        unit_price: item.price,
      })),
    }).subscribe({
      next: () => {
        this.cartStore.clear();
        this.cartStore.notifyOrderCreated();
        this.clearPersonSearch();
        this.orderNotes.set('');
        this.buying.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Pedido creado correctamente',
        });
      },
      error: (err) => {
        this.buying.set(false);
        const msg = err?.error?.message || 'Error al crear el pedido';
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: msg,
        });
      },
    });
  }

  protected goBack(): Promise<boolean> {
    return this.router.navigateByUrl('/');
  }

  private applyPerson(person: Person): void {
    this.person.set(person);
    this.contactName.set(person.name);
    this.phone.set(person.whatsappPhone);
    this.fullAddress.set(person.fullAddress);
    this.documentType.set(person.identityDocument.substring(0, 1) || 'V');
    this.documentNumber.set(person.identityDocument.substring(1));
    this.isLegalPerson.set(!(person.identityDocument.substring(0, 1) === 'V' || person.identityDocument.substring(0, 1) === 'E'));
  }

  private normalizeDigits(value: string, maxLength: number): string {
    return value.replace(/\D/g, '').slice(0, maxLength);
  }

  private getDefaultDocumentType(): string {
    return this.isLegalPerson() ? 'J' : 'V';
  }

  private personPayload() {
    return {
      name: this.contactName().trim(),
      identityDocument: `${this.documentType()}${this.documentNumber().trim()}`,
      whatsappPhone: this.phone().trim(),
      fullAddress: this.fullAddress().trim(),
    };
  }

  protected isPersonFormValid(): boolean {
    if (!this.personFieldsVisible()) return false;
    if (this.documentNumber().trim().length === 0) return false;
    if (this.contactName().trim().length === 0) return false;
    if (this.phone().trim().length === 0) return false;
    if (this.fullAddress().trim().length === 0) return false;
    return true;
  }
}
