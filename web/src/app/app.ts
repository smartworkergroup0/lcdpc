import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { FooterComponent } from './shared/footer/footer.component';
import { HeaderComponent } from './shared/header/header.component';
import { BranchSelectorDialogComponent } from './shared/branch-selector-dialog/branch-selector-dialog.component';
import { AuthStore } from './core/auth/auth.store';
import { BranchStore } from './core/stores/branch.store';
import { CartStore } from './core/stores/cart.store';
import { LoadingStateService } from './core/loading/loading-state.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, HeaderComponent, FooterComponent, BranchSelectorDialogComponent, ProgressSpinnerModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly authStore = inject(AuthStore);
  protected readonly branchStore = inject(BranchStore);
  protected readonly cartStore = inject(CartStore);
  protected readonly loadingState = inject(LoadingStateService);

  @ViewChild('branchDialog') branchDialog!: BranchSelectorDialogComponent;

  protected readonly showStoreShell = signal(!this.isAuthRoute(this.router.url));
  protected readonly isCartRoute = signal(this.router.url.startsWith('/cart'));
  protected readonly isAdminRoute = signal(this.router.url.startsWith('/admin'));

  constructor() {
    const subscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.isCartRoute.set(event.urlAfterRedirects.startsWith('/cart'));
        this.isAdminRoute.set(event.urlAfterRedirects.startsWith('/admin'));
        this.showStoreShell.set(!this.isAuthRoute(event.urlAfterRedirects));
      });

    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  ngOnInit(): void {
    this.branchStore.load();
  }

  protected selectBranch(branchId: string | null): void {
    if (branchId) {
      this.branchStore.selectBranch(branchId);
    }
  }

  protected goToCart(): void {
    void this.router.navigateByUrl('/cart');
  }

  protected openBranchDialog(): void {
    this.branchDialog.open();
  }

	private isAuthRoute(url: string): boolean {
		return url.startsWith('/login') || url.startsWith('/register');
	}
}
