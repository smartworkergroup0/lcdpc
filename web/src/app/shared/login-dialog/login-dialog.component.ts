import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { LoginFormComponent } from '../login-form/login-form.component';

@Component({
  selector: 'app-login-dialog',
  standalone: true,
  imports: [DialogModule, LoginFormComponent],
  template: `
    <p-dialog
      header="Iniciar Sesión"
      [visible]="visible"
      (visibleChange)="visibleChange.emit($event)"
      [modal]="true"
      [dismissableMask]="true"
      [draggable]="false"
      [closable]="true"
      [style]="{ width: 'min(400px, 95vw)' }"
    >
      <app-login-form (loginSuccess)="loginSuccess.emit()" />
    </p-dialog>
  `,
})
export class LoginDialogComponent {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() loginSuccess = new EventEmitter<void>();
}
