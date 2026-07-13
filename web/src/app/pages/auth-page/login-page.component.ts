import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { InputOtpModule } from 'primeng/inputotp';
import { StepperModule } from 'primeng/stepper';
import { AuthApiService } from './auth-api-go.service';
import { LoginFormComponent } from '../../shared/login-form/login-form.component';
import { AuthStore } from '../../core/auth/auth.store';

type RecoveryStep = 1 | 2 | 3;

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonModule,
    FloatLabelModule,
    InputGroupAddonModule,
    InputGroupModule,
    InputOtpModule,
    InputTextModule,
    PasswordModule,
    StepperModule,
    LoginFormComponent
  ],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss'
})
export class LoginPageComponent implements OnInit, OnDestroy {
	private readonly authStore = inject(AuthStore);
	private readonly authApi = inject(AuthApiService);
	private readonly router = inject(Router);
	private readonly emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

	protected readonly errorMessage = signal('');
	protected readonly recoveryMode = signal(false);
	protected readonly recoveryStep = signal<RecoveryStep>(1);
	protected readonly recoverySubmitted = signal(false);
	protected readonly recoveryNotice = signal('');
	protected readonly recoveryError = signal('');
	protected readonly recoveryEmailLocked = signal('');
	protected readonly recoveryEmail = signal('');
  protected readonly recoveryToken = signal('');
  protected readonly otpSecondsLeft = signal(0);
  protected readonly otpPolicy = signal({ ttlMinutes: 0, maxAttempts: 0, cooldownMinutes: 0 });
  protected readonly newPassword = signal('');
	protected readonly confirmPassword = signal('');
  protected readonly isSendingRecoveryEmail = signal(false);
  protected readonly isResettingPassword = signal(false);
  protected readonly recoveryCompleted = signal(false);
  private recoveryCountdownHandle: ReturnType<typeof setInterval> | null = null;
	protected readonly isRecoveryEmailValid = computed(() => this.emailRegex.test(this.recoveryEmail().trim().toLowerCase()));
  protected readonly isRecoveryTokenValid = computed(() => /^\d{6}$/.test(this.recoveryToken()));
  protected readonly canResendRecoveryOtp = computed(() => this.otpSecondsLeft() === 0);
	protected readonly isNewPasswordValid = computed(() => this.newPassword().length >= 8);
	protected readonly isConfirmPasswordValid = computed(() => this.confirmPassword().length > 0 && this.confirmPassword() === this.newPassword());
	protected readonly isPasswordMismatch = computed(() => this.confirmPassword().length > 0 && this.newPassword().length > 0 && this.confirmPassword() !== this.newPassword());

	ngOnInit(): void {
		if (this.authStore.isAuthenticated()) {
			void this.router.navigateByUrl('/');
		}
	}

	ngOnDestroy(): void {
		this.stopRecoveryCountdown();
	}

	protected onLoginSuccess(): void {
		this.errorMessage.set('');
		void this.router.navigateByUrl('/');
	}

	protected onLoginError(message: string): void {
		this.errorMessage.set(message);
	}

	protected openRecovery(): void {
		this.errorMessage.set('');
		this.resetRecoveryFlow();
		this.recoveryMode.set(true);
	}

	protected backToLogin(): void {
		this.resetRecoveryFlow();
		this.recoveryMode.set(false);
	}

	protected async sendRecoveryEmail(): Promise<void> {
		if (this.isSendingRecoveryEmail()) {
			return;
		}

		this.recoverySubmitted.set(true);
		this.recoveryError.set('');
		this.recoveryNotice.set('');
		if (!this.isRecoveryEmailValid()) {
			return;
		}

		this.isSendingRecoveryEmail.set(true);
		try {
			const email = this.recoveryEmail().trim().toLowerCase();
			const response = await firstValueFrom(this.authApi.forgotPassword({ email }));
			this.recoveryEmailLocked.set(email);
			this.recoveryNotice.set(response.message);
			this.otpPolicy.set(response.otpPolicy);
			this.recoveryToken.set('');
			this.startRecoveryCountdown(response.otpPolicy.ttlMinutes * 60);
			this.recoveryStep.set(2);
			this.recoverySubmitted.set(false);
		} catch (error) {
			this.recoveryError.set(this.resolveRecoveryError(error, 'No se pudo iniciar la recuperación.'));
		} finally {
			this.isSendingRecoveryEmail.set(false);
		}
	}

	protected continueWithToken(): void {
		this.recoverySubmitted.set(true);
		this.recoveryError.set('');
		if (!this.isRecoveryTokenValid()) {
			return;
		}

		this.recoveryStep.set(3);
		this.recoverySubmitted.set(false);
	}

	protected async resendRecoveryOtp(): Promise<void> {
		if (!this.canResendRecoveryOtp() || this.isSendingRecoveryEmail() || !this.recoveryEmailLocked()) {
			return;
		}

		this.recoveryEmail.set(this.recoveryEmailLocked());
		await this.sendRecoveryEmail();
	}

	protected async resetPassword(): Promise<void> {
		if (this.isResettingPassword()) {
			return;
		}

		this.recoverySubmitted.set(true);
		this.recoveryError.set('');
		if (!this.isRecoveryTokenValid() || !this.isNewPasswordValid() || !this.isConfirmPasswordValid()) {
			return;
		}

		this.isResettingPassword.set(true);
		try {
			await firstValueFrom(this.authApi.resetPassword({ email: this.recoveryEmailLocked(), otp: this.recoveryToken().trim(), newPassword: this.newPassword() }));
			this.recoveryCompleted.set(true);
			this.recoveryNotice.set('Tu contraseña fue actualizada correctamente. Ya podés iniciar sesión.');
			this.recoverySubmitted.set(false);
		} catch (error) {
			this.recoveryError.set(this.resolveRecoveryError(error, 'No se pudo actualizar la contraseña.'));
		} finally {
			this.isResettingPassword.set(false);
		}
	}

	private resolveRecoveryError(error: unknown, fallbackMessage: string): string {
		if (!(error instanceof HttpErrorResponse)) {
			return fallbackMessage;
		}

		const rawCode = typeof error.error?.code === 'string' ? error.error.code : '';
		const rawMessage = typeof error.error?.message === 'string' ? error.error.message : '';
		const apiCode = rawCode || rawMessage;

		switch (apiCode) {
			case 'OTP_INVALID':
				return 'El código de recuperación es inválido. Revisá el OTP y volvé a intentar.';
			case 'OTP_EXPIRED':
				return 'El código de recuperación expiró. Pedí uno nuevo.';
			case 'OTP_ATTEMPTS_EXCEEDED':
				return 'Superaste los intentos permitidos. Pedí un nuevo código.';
			case 'OTP_COOLDOWN_ACTIVE':
				return 'Esperá un momento antes de pedir otro código.';
			case 'INVALID_RESET_TTL':
				return 'El servidor rechazó el tiempo de recuperación configurado.';
			default:
				break;
		}

		if (error.status === 0) {
			return 'No se pudo conectar con la API. Verificá que el backend esté levantado.';
		}

		return fallbackMessage;
	}

	private resetRecoveryFlow(): void {
		this.recoveryStep.set(1);
		this.recoverySubmitted.set(false);
		this.recoveryNotice.set('');
		this.recoveryError.set('');
		this.recoveryEmail.set('');
		this.recoveryEmailLocked.set('');
		this.recoveryToken.set('');
		this.otpSecondsLeft.set(0);
		this.otpPolicy.set({ ttlMinutes: 0, maxAttempts: 0, cooldownMinutes: 0 });
		this.newPassword.set('');
		this.confirmPassword.set('');
		this.isSendingRecoveryEmail.set(false);
		this.isResettingPassword.set(false);
		this.recoveryCompleted.set(false);
		this.stopRecoveryCountdown();
	}

	private startRecoveryCountdown(seconds: number): void {
		this.stopRecoveryCountdown();
		this.otpSecondsLeft.set(seconds);
		if (seconds <= 0) {
			return;
		}
		this.recoveryCountdownHandle = setInterval(() => {
			const nextValue = this.otpSecondsLeft() - 1;
			if (nextValue <= 0) {
				this.otpSecondsLeft.set(0);
				this.stopRecoveryCountdown();
				return;
			}
			this.otpSecondsLeft.set(nextValue);
		}, 1000);
	}

	private stopRecoveryCountdown(): void {
		if (this.recoveryCountdownHandle === null) {
			return;
		}

		clearInterval(this.recoveryCountdownHandle);
		this.recoveryCountdownHandle = null;
	}
}
