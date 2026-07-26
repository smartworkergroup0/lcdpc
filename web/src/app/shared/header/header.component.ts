import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Input, Output, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { Popover, PopoverModule } from 'primeng/popover';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { AuthStore } from '../../core/auth/auth.store';
import { CartStore } from '../../core/stores/cart.store';
import { SystemConfigStore } from '../../core/stores/system-config.store';

export type HeaderBranch = {
  id: string;
  name: string;
};

function generateColorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 70%, 45%)`;
}

@Component({
	selector: 'app-header',
	standalone: true,
	imports: [CommonModule, FormsModule, RouterLink, ButtonModule, PopoverModule, SelectModule, ToastModule],
	templateUrl: './header.component.html',
	styleUrl: './header.component.scss',
	host: {
		'[class.admin-mode]': 'isAdminRoute()',
		'[class.sidebar-collapsed]': 'sidebarCollapsed',
	},
})
export class HeaderComponent {
	private readonly authStore = inject(AuthStore);
	private readonly cartStore = inject(CartStore);
	private readonly router = inject(Router);
	private readonly destroyRef = inject(DestroyRef);
	readonly systemConfigStore = inject(SystemConfigStore);

	@ViewChild('cartOverlay') cartOverlay!: Popover;
	@ViewChild('userMenuPopover') userMenuPopover!: Popover;

  @Input() branches: HeaderBranch[] = [];
  @Input() selectedBranchId = '';
  @Input() sidebarCollapsed = false;
  @Input() showMobileMenuButton = false;

  @Output() branchChange = new EventEmitter<string>();
  @Output() mobileMenuToggle = new EventEmitter<void>();

  protected readonly user = this.authStore.currentUser;
  protected readonly isAuthenticated = this.authStore.isAuthenticated;
  protected readonly cartItems = this.cartStore.items;
  protected readonly cartCount = this.cartStore.totalItems;
  protected readonly cartQuantity = this.cartStore.totalQuantity;
  protected readonly visibleCartItems = computed(() => this.cartItems().slice(0, 4));
  protected readonly hiddenCartItems = computed(() => Math.max(0, this.cartItems().length - 4));
  protected readonly hasCartItems = computed(() => this.cartCount() > 0);
  protected readonly userInitial = computed(() => (this.user()?.displayName ?? '').charAt(0).toUpperCase());
  protected readonly userColor = computed(() => generateColorFromName(this.user()?.displayName ?? ''));

  protected readonly isAdminRoute = signal(this.router.url.startsWith('/admin'));

  protected isCartRoute(): boolean {
    return this.router.url.startsWith('/cart');
  }

  protected readonly isAdmin = computed(() => {
    const perms = this.authStore.permissions();
    const modulePerms = perms.filter(p => p.startsWith('module:'));
    const hasAccess = this.authStore.hasAnyPermission(
      'module:dashboard:view',
      'module:operaciones:view',
      'module:almacen:view',
      'module:personas:view',
      'module:configuracion:view',
      'module:asistente:view'
    );
    console.log('[Header] isAdmin check:', { hasAccess, totalPerms: perms.length, modulePerms });
    return hasAccess;
  });

  constructor() {
    const subscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.isAdminRoute.set(event.urlAfterRedirects.startsWith('/admin'));
      });
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

	protected onLogoError(event: Event): void {
		(event.target as HTMLImageElement).src = '/not-found.png';
	}

  protected toggleCartOverlay(event: Event): void {
    this.cartOverlay.toggle(event);
  }

  protected toggleUserMenu(event: Event): void {
    this.userMenuPopover.toggle(event);
  }

  protected goToCart(): void {
    if (!this.hasCartItems()) return;
    this.cartOverlay.hide();
    void this.router.navigateByUrl('/cart');
  }

  protected goToAdmin(): void {
    console.log('[Header] goToAdmin clicked');
    void this.router.navigate(['/admin']);
  }

  protected goToLogin(): void {
    console.log('[Header] goToLogin clicked');
    void this.router.navigate(['/login']);
  }

	protected async logout(): Promise<void> {
		await this.authStore.logout().toPromise();
		await this.router.navigateByUrl('/');
	}
}
