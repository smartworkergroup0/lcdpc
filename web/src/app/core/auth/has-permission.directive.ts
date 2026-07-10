import { Directive, Input, OnInit, TemplateRef, ViewContainerRef, inject } from '@angular/core';
import { AuthStore } from './auth.store';

@Directive({
  selector: '[hasPermission]',
  standalone: true,
})
export class HasPermissionDirective implements OnInit {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly authStore = inject(AuthStore);

  private requiredPermission = '';

  @Input()
  set hasPermission(permission: string) {
    this.requiredPermission = permission;
    this.updateView();
  }

  ngOnInit(): void {
    this.updateView();
  }

  private updateView(): void {
    this.viewContainer.clear();
    if (this.authStore.hasPermission(this.requiredPermission)) {
      this.viewContainer.createEmbeddedView(this.templateRef);
    }
  }
}
