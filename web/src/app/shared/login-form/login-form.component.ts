import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthStore } from '../../core/auth/auth.store';

@Component({
  selector: 'app-login-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, PasswordModule],
  template: `
    <form class="login-form" (ngSubmit)="submit()">
      <div class="login-field">
        <label for="login-username">Correo o Usuario</label>
        <input
          id="login-username"
          pInputText
          type="text"
          autocomplete="username"
          [ngModel]="username()"
          (ngModelChange)="username.set($event)"
          name="username"
          placeholder="ejemplo@correo.com"
        />
      </div>

      <div class="login-field">
        <label for="login-password">Contraseña</label>
        <p-password
          inputId="login-password"
          [feedback]="false"
          [toggleMask]="true"
          [ngModel]="password()"
          (ngModelChange)="password.set($event)"
          name="password"
          autocomplete="current-password"
          placeholder="••••••••"
          styleClass="login-password"
        ></p-password>
      </div>

      <p-button
        type="submit"
        label="Iniciar Sesión"
        styleClass="login-submit-btn"
        [loading]="isSubmitting()"
        [disabled]="!canSubmit() || isSubmitting()"
      ></p-button>
    </form>
  `,
  styles: [`
    .login-form {
      display: grid;
      gap: 1rem;
    }

    .login-field {
      display: grid;
      gap: 0.4rem;
    }

    .login-field label {
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--text-soft);
    }

    :host ::ng-deep .login-field .p-inputtext,
    :host ::ng-deep .login-field .p-password-input {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      background: var(--surface);
      color: var(--text-strong);
      min-height: 2.5rem;
      box-shadow: none;
    }

    :host ::ng-deep .login-field .p-inputtext:enabled:focus,
    :host ::ng-deep .login-field .p-password-input:enabled:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(242, 116, 5, 0.15);
    }

    :host ::ng-deep .login-password.p-password {
      width: 100%;
    }

    :host ::ng-deep .login-password .p-password-input {
      padding-right: 2.5rem;
    }

    :host ::ng-deep .login-password .p-password-toggle-mask-icon {
      color: #8b7264;
      margin-right: 0.35rem;
    }

    :host ::ng-deep .login-submit-btn {
      width: 100%;
      background: #994700;
      border-color: #994700;
      color: #fff;
      font-weight: 700;
      min-height: 2.7rem;
    }

    :host ::ng-deep .login-submit-btn:hover {
      background: #f27405;
      border-color: #f27405;
    }
  `],
})
export class LoginFormComponent {
  private readonly authStore = inject(AuthStore);

  @Output() loginSuccess = new EventEmitter<void>();
  @Output() loginError = new EventEmitter<string>();

  protected readonly username = signal('admin@lcdpc.local');
  protected readonly password = signal('SuperPerro123!');
  protected readonly isSubmitting = signal(false);
  protected readonly canSubmit = computed(() => this.username().trim().length > 0 && this.password().trim().length > 0);

  protected async submit(): Promise<void> {
    if (!this.canSubmit() || this.isSubmitting()) return;

    this.isSubmitting.set(true);

    try {
      await firstValueFrom(this.authStore.login(this.username().trim(), this.password()));
      this.loginSuccess.emit();
    } catch (error) {
      this.loginError.emit(this.resolveSubmitError(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private resolveSubmitError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) return 'Credenciales inválidas. Verificá tu correo y contraseña.';
      if (error.status === 403) return 'Tu usuario no tiene acceso habilitado en este momento.';
      if (error.status === 0) return 'No se pudo conectar con el backend.';
      return 'No se pudo iniciar sesión. Intentá nuevamente.';
    }
    return 'Ocurrió un error inesperado. Intentá nuevamente.';
  }
}
