import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputOtpModule } from 'primeng/inputotp';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { StepperModule } from 'primeng/stepper';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { AuthApiService, StartRegistrationResponse } from '../auth-page/auth-api-go.service';
import { AuthStore } from '../../core/auth/auth.store';

type RegisterStep = 1 | 2 | 3;
type DocumentTypeOption = { label: string; value: string };
type PhonePrefixOption = { label: string; value: string };

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonModule,
    CheckboxModule,
    FloatLabelModule,
    InputGroupModule,
    InputGroupAddonModule,
    InputOtpModule,
    InputTextModule,
    PasswordModule,
    SelectModule,
    StepperModule,
    ToggleSwitchModule
  ],
  templateUrl: './register-page.component.html',
  styleUrl: './register-page.component.scss'
})
export class RegisterPageComponent {
  private readonly authApi = inject(AuthApiService);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  private readonly nameRegex = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ']+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ']+)*$/;
  private readonly flowId = signal('');
  private otpCountdownHandle: ReturnType<typeof setInterval> | null = null;

  protected readonly step = signal<RegisterStep>(1);
  protected readonly submitAttempted = signal(false);
  protected readonly isSendingCode = signal(false);
  protected readonly isVerifyingCode = signal(false);
  protected readonly isSubmittingProfile = signal(false);
  protected readonly isLoggingIn = signal(false);
  protected readonly apiError = signal('');

  protected readonly businessEmail = signal('');
  protected readonly codeSent = signal(false);
  protected readonly otpCode = signal('');
  protected readonly otpSecondsLeft = signal(0);
  protected readonly forceOtpResendVisible = signal(false);

  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly isJuridical = signal(false);
  protected readonly cedulaType = signal('V');
  protected readonly cedula = signal('');
  protected readonly rifType = signal('J');
  protected readonly rif = signal('');
  protected readonly whatsapp = signal('');
  protected readonly address = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly acceptedTerms = signal(false);

  protected readonly cedulaTypeOptions: DocumentTypeOption[] = [
    { label: 'V', value: 'V' },
    { label: 'E', value: 'E' }
  ];

  protected readonly rifTypeOptions: DocumentTypeOption[] = [
    { label: 'V', value: 'V' },
    { label: 'E', value: 'E' },
    { label: 'J', value: 'J' },
    { label: 'G', value: 'G' },
    { label: 'C', value: 'C' }
  ];

  protected readonly isBusinessEmailValid = computed(() => this.emailRegex.test(this.businessEmail().trim().toLowerCase()));
  protected readonly isOtpValid = computed(() => /^\d{6}$/.test(this.otpCode()));
  protected readonly isFirstNameValid = computed(() => this.isValidName(this.firstName()));
  protected readonly whatsappPrefixOptions: PhonePrefixOption[] = [
    { label: '0412', value: '0412' },
    { label: '0422', value: '0422' },
    { label: '0414', value: '0414' },
    { label: '0424', value: '0424' },
    { label: '0416', value: '0416' },
    { label: '0426', value: '0426' }
  ];
  protected readonly isLastNameValid = computed(() => this.isValidName(this.lastName()));
  protected readonly isCedulaValid = computed(() => /^\d{6,8}$/.test(this.cedula()));
  protected readonly isRifValid = computed(() => !this.isJuridical() || /^\d{5,9}$/.test(this.rif()));
  protected readonly isNaturalPerson = computed(() => !this.isJuridical());
  protected readonly whatsappPrefix = signal('0414');
  protected readonly isWhatsappValid = computed(() => /^\d{7}$/.test(this.whatsapp()));
  protected readonly isWhatsappPrefixValid = computed(() =>
    this.whatsappPrefixOptions.some((opt) => opt.value === this.whatsappPrefix())
  );
  protected readonly isAddressValid = computed(() => this.address().trim().length >= 10);
  protected readonly isPasswordValid = computed(() => this.password().length >= 8);
  protected readonly isConfirmPasswordValid = computed(() => this.confirmPassword().length > 0 && this.confirmPassword() === this.password());
  protected readonly isPasswordMismatch = computed(
    () => this.confirmPassword().length > 0 && this.password().length > 0 && this.confirmPassword() !== this.password()
  );

  protected readonly canSubmit = computed(
    () =>
      this.isFirstNameValid() &&
      this.isLastNameValid() &&
      (this.isNaturalPerson() ? this.isCedulaValid() : this.isRifValid()) &&
      this.isWhatsappPrefixValid() &&
      this.isWhatsappValid() &&
      this.isAddressValid() &&
      this.isPasswordValid() &&
      this.isConfirmPasswordValid() &&
      this.acceptedTerms()
  );

  protected readonly fullName = computed(() => `${this.firstName().trim()} ${this.lastName().trim()}`.trim());
  protected readonly personTypeLabel = computed(() => (this.isJuridical() ? 'Jurídica' : 'Natural'));

  constructor() {
    this.destroyRef.onDestroy(() => this.stopOtpCountdown());
  }

  protected updateFirstName(value: string): void {
    this.firstName.set(this.normalizeName(value));
  }

  protected updateFirstNameFromInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (!input) {
      return;
    }

    this.updateFirstName(input.value);
  }

  protected updateLastName(value: string): void {
    this.lastName.set(this.normalizeName(value));
  }

  protected updateLastNameFromInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (!input) {
      return;
    }

    this.updateLastName(input.value);
  }

  protected onPersonTypeChange(value: boolean): void {
    this.isJuridical.set(value);
    if (value) {
      this.cedula.set('');
      this.cedulaType.set('V');
      return;
    }

    this.rif.set('');
    this.rifType.set('J');
  }

  protected allowOnlyNameCharacters(event: KeyboardEvent): void {
    const allowedKeys = [
      'Backspace',
      'Delete',
      'Tab',
      'Escape',
      'Enter',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End'
    ];

    if (allowedKeys.includes(event.key) || event.ctrlKey || event.metaKey) {
      return;
    }

    if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'\s]$/.test(event.key)) {
      event.preventDefault();
    }
  }

  protected sanitizeNamePaste(event: ClipboardEvent): void {
    const pastedText = event.clipboardData?.getData('text') ?? '';
    const normalizedText = this.normalizeName(pastedText);

    if (normalizedText.length !== pastedText.length) {
      event.preventDefault();
    }

    const target = event.target as HTMLInputElement | null;
    if (target?.id === 'firstName') {
      this.firstName.set(normalizedText);
      return;
    }

    if (target?.id === 'lastName') {
      this.lastName.set(normalizedText);
    }
  }

  protected updateCedula(value: string): void {
    this.cedula.set(this.normalizeDigits(value, 8));
  }

  protected sanitizeCedulaPaste(event: ClipboardEvent): void {
    const pastedText = event.clipboardData?.getData('text') ?? '';
    const digitsOnly = this.normalizeDigits(pastedText, 8);

    if (digitsOnly.length !== pastedText.length) {
      event.preventDefault();
    }

    this.cedula.set(digitsOnly);
  }

  protected updateRif(value: string): void {
    this.rif.set(this.normalizeDigits(value, 9));
  }

  protected sanitizeRifPaste(event: ClipboardEvent): void {
    const pastedText = event.clipboardData?.getData('text') ?? '';
    const digitsOnly = this.normalizeDigits(pastedText, 9);

    if (digitsOnly.length !== pastedText.length) {
      event.preventDefault();
    }

    this.rif.set(digitsOnly);
  }

  protected updateWhatsapp(value: string): void {
    this.whatsapp.set(this.normalizeDigits(value, 7));
  }

  protected allowOnlyDigits(event: KeyboardEvent): void {
    const allowedKeys = [
      'Backspace',
      'Delete',
      'Tab',
      'Escape',
      'Enter',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End'
    ];

    if (allowedKeys.includes(event.key) || event.ctrlKey || event.metaKey) {
      return;
    }

    if (!/^\d$/.test(event.key)) {
      event.preventDefault();
    }
  }

  protected sanitizeWhatsappPaste(event: ClipboardEvent): void {
    const pastedText = event.clipboardData?.getData('text') ?? '';
    const digitsOnly = this.normalizeDigits(pastedText, 7);

    if (digitsOnly.length !== pastedText.length) {
      event.preventDefault();
    }

    this.whatsapp.set(digitsOnly);
  }

  protected async sendCode(): Promise<void> {
    if (this.isSendingCode()) {
      return;
    }

    this.submitAttempted.set(true);
    this.apiError.set('');
    if (!this.isBusinessEmailValid()) {
      return;
    }

    this.isSendingCode.set(true);
    try {
      const response = await firstValueFrom(this.authApi.startRegistration({ email: this.businessEmail().trim() }));
      this.applyStartRegistrationState(response);
      this.submitAttempted.set(false);
    } catch (error) {
      this.apiError.set(this.resolveApiError(error, 'No se pudo enviar el código OTP.'));
    } finally {
      this.isSendingCode.set(false);
    }
  }

  protected async verifyCode(): Promise<void> {
    if (this.isVerifyingCode()) {
      return;
    }

    this.submitAttempted.set(true);
    this.apiError.set('');
    if (!this.isBusinessEmailValid() || !this.isOtpValid()) {
      return;
    }

    if (!this.flowId()) {
      this.apiError.set('Primero tenés que solicitar el código OTP.');
      return;
    }

    this.isVerifyingCode.set(true);
    try {
      await firstValueFrom(this.authApi.verifyEmail({ flowId: this.flowId(), otp: this.otpCode() }));
      this.email.set(this.businessEmail().trim());
      this.step.set(2);
      this.codeSent.set(false);
      this.forceOtpResendVisible.set(false);
      this.stopOtpCountdown();
      this.submitAttempted.set(false);
    } catch (error) {
      const apiCode = error instanceof HttpErrorResponse && typeof error.error?.code === 'string' ? error.error.code : '';
      if (apiCode === 'FLOW_INVALID_STATUS') {
        this.forceOtpResendVisible.set(true);
        this.otpSecondsLeft.set(0);
      }

      if (apiCode === 'OTP_EXPIRED') {
        this.forceOtpResendVisible.set(true);
        this.otpSecondsLeft.set(0);
      }

      this.apiError.set(this.resolveApiError(error, 'No se pudo verificar el OTP.'));
    } finally {
      this.isVerifyingCode.set(false);
    }
  }

  protected goToStepOne(): void {
    this.step.set(1);
    this.submitAttempted.set(false);
  }

  protected async submitProfile(): Promise<void> {
    if (this.isSubmittingProfile()) {
      return;
    }

    this.submitAttempted.set(true);
    this.apiError.set('');
    if (!this.canSubmit()) {
      return;
    }

    if (!this.flowId()) {
      this.apiError.set('El flujo de registro no está inicializado. Volvé al paso 1.');
      return;
    }

	const identityDocument = this.getIdentityDocument();
	if (!identityDocument) {
		this.apiError.set(this.isJuridical() ? 'El RIF es obligatorio para continuar.' : 'La cédula es obligatoria para continuar.');
		return;
	}

    this.isSubmittingProfile.set(true);
    try {
      const check = await firstValueFrom(this.authApi.checkDocumentAvailability(identityDocument));
      if (!check.available) {
        this.apiError.set(check.message ?? 'Ese documento ya pertenece a una persona que ya tiene un usuario en el sistema.');
        return;
      }

      await firstValueFrom(this.authApi.completeRegistration({
        flowId: this.flowId(),
        firstName: this.firstName().trim(),
        lastName: this.lastName().trim(),
        identityDocument,
        taxId: this.isJuridical() && this.rif().trim().length > 0 ? `${this.rifType()}${this.rif()}` : null,
        whatsappPhone: `${this.whatsappPrefix()}${this.whatsapp()}`,
        fullAddress: this.address().trim(),
        password: this.password()
      }));

      this.step.set(3);
    } catch (error) {
      this.apiError.set(this.resolveApiError(error, 'No se pudo completar el registro.'));
    } finally {
      this.isSubmittingProfile.set(false);
    }
  }

  protected async loginAndGoToShop(): Promise<void> {
    if (this.isLoggingIn()) {
      return;
    }

    this.isLoggingIn.set(true);
    try {
      await firstValueFrom(this.authStore.login(this.businessEmail(), this.password()));
      this.router.navigateByUrl('/');
    } catch {
      this.router.navigateByUrl('/login');
    } finally {
      this.isLoggingIn.set(false);
    }
  }

  protected resetFlow(): void {
    this.step.set(1);
    this.submitAttempted.set(false);
    this.codeSent.set(false);
    this.businessEmail.set('');
    this.otpCode.set('');
    this.otpSecondsLeft.set(0);
    this.forceOtpResendVisible.set(false);
    this.firstName.set('');
    this.lastName.set('');
    this.isJuridical.set(false);
    this.cedulaType.set('V');
    this.cedula.set('');
    this.rifType.set('J');
    this.rif.set('');
    this.whatsappPrefix.set('0414');
    this.whatsapp.set('');
    this.address.set('');
    this.email.set('');
    this.password.set('');
    this.confirmPassword.set('');
    this.acceptedTerms.set(false);
    this.flowId.set('');
    this.apiError.set('');
    this.isSendingCode.set(false);
    this.isVerifyingCode.set(false);
    this.isSubmittingProfile.set(false);
    this.stopOtpCountdown();
  }

  private resolveApiError(error: unknown, fallbackMessage: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallbackMessage;
    }

    const rawCode = typeof error.error?.code === 'string' ? error.error.code : '';
    const rawMessage = typeof error.error?.message === 'string' ? error.error.message : '';
    const apiCode = rawCode || rawMessage;

    switch (apiCode) {
      case 'EMAIL_ALREADY_REGISTERED':
        return 'El correo ya se encuentra registrado.';
      case 'OTP_INVALID':
        return 'El OTP es inválido. Revisá el código en la BD y volvé a intentar.';
      case 'OTP_EXPIRED':
        return 'El OTP expiró. Reenviá un nuevo código.';
      case 'OTP_ATTEMPTS_EXCEEDED':
        return 'Superaste los intentos permitidos. Reenviá un nuevo OTP.';
      case 'OTP_COOLDOWN_ACTIVE':
        return 'Superaste los intentos permitidos. Esperá unos minutos antes de pedir otro código.';
      case 'FLOW_NOT_FOUND':
        return 'No se encontró el flujo de registro. Volvé a iniciar desde el paso 1.';
      case 'FLOW_INVALID_STATUS':
        return 'El OTP expiró. Reenviá un nuevo código.';
      case 'DOCUMENT_ALREADY_LINKED_TO_USER':
        return 'El documento que está intentando colocar se encuentra registrado a otro usuario.';
      default:
        break;
    }

    if (error.status === 0) {
      return 'No se pudo conectar con la API. Verificá que el backend esté levantado.';
    }

    return fallbackMessage;
  }

  private normalizeName(value: string): string {
    return value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ'\s]/g, '').replace(/\s{2,}/g, ' ').replace(/^\s+/, '');
  }

  private normalizeDigits(value: string, maxLength: number): string {
    return value.replace(/\D/g, '').slice(0, maxLength);
  }

  private applyStartRegistrationState(response: StartRegistrationResponse): void {
    this.flowId.set(response.flowId);

    this.codeSent.set(true);
    this.forceOtpResendVisible.set(false);
    this.otpCode.set('');
    this.startOtpCountdown(response.otpPolicy.ttlMinutes * 60);
  }

  private startOtpCountdown(seconds: number): void {
    this.stopOtpCountdown();
    this.otpSecondsLeft.set(seconds);

    this.otpCountdownHandle = setInterval(() => {
      const nextValue = this.otpSecondsLeft() - 1;
      if (nextValue <= 0) {
        this.otpSecondsLeft.set(0);
        this.stopOtpCountdown();
        return;
      }

      this.otpSecondsLeft.set(nextValue);
    }, 1000);
  }

  private stopOtpCountdown(): void {
    if (this.otpCountdownHandle === null) {
      return;
    }

    clearInterval(this.otpCountdownHandle);
    this.otpCountdownHandle = null;
  }

  private isValidName(value: string): boolean {
    return this.nameRegex.test(value.trim());
  }

  private getIdentityDocument(): string {
	return this.isJuridical() ? `${this.rifType()}${this.rif().trim()}` : `${this.cedulaType()}${this.cedula().trim()}`;
  }
}
