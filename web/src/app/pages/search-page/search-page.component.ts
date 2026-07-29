import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProductApiService } from '../../core/services/product-api.service';
import { BundleApiService } from '../../core/services/bundle-api.service';
import { BranchStore } from '../../core/stores/branch.store';
import { CategoryStore } from '../../core/stores/category.store';
import { AdvancedSearchComponent, SearchResultItem } from '../../shared/advanced-search/advanced-search.component';
import { CatalogSearchComponent } from '../../shared/catalog-search/catalog-search.component';

const NOT_FOUND_IMAGE = '/not-found.png';

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [CommonModule, CatalogSearchComponent, AdvancedSearchComponent],
  templateUrl: './search-page.component.html'
})
export class SearchPageComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly productApi = inject(ProductApiService);
  private readonly bundleApi = inject(BundleApiService);
  private readonly branchStore = inject(BranchStore);
  private readonly destroyRef = inject(DestroyRef);
  readonly categoryStore = inject(CategoryStore);

  protected query = this.route.snapshot.queryParamMap.get('q')?.trim() || '';
  protected readonly searchResults = signal<SearchResultItem[]>([]);
  protected readonly loading = signal(false);

  ngOnInit(): void {
    this.categoryStore.load();
    this.branchStore.load();
    this.waitForBranchAndLoad();
  }

  private waitForBranchAndLoad(): void {
    const branchCheck = setInterval(() => {
      const id = this.branchStore.selectedBranchId();
      if (id) {
        clearInterval(branchCheck);
        this.loadData();
      }
    }, 50);

    this.destroyRef.onDestroy(() => clearInterval(branchCheck));
  }

  private loadData(): void {
    const branchId = this.branchStore.selectedBranchId();
    if (!branchId) return;

    this.loading.set(true);

    const search = this.query.trim();
    const filter = search
      ? { name: search, limit: 50, branch_id: branchId }
      : { limit: 50, branch_id: branchId };

    forkJoin({
      products: this.productApi.listCatalog(filter),
      bundles: this.bundleApi.listCatalog(filter)
    }).subscribe({
      next: ({ products, bundles }) => {
        const bundleItems: SearchResultItem[] = bundles.items.map((b) => ({
          id: b.bundleId,
          name: b.name,
          price: '$0.00',
          description: `Código: ${b.code}`,
          imageUrl: this.bundleApi.resolveImageUrl(b.img) ?? NOT_FOUND_IMAGE,
          alt: b.name,
          tags: [this.categoryStore.getCategoryName(b.categoryId)],
          unitLabel: 'Precio Total Combo',
          featured: true
        }));

        const productItems: SearchResultItem[] = products.items.map((p) => ({
          id: p.productId,
          name: p.name,
          price: '$0.00',
          description: '',
          imageUrl: this.productApi.resolveImageUrl(p.img) ?? NOT_FOUND_IMAGE,
          alt: p.name,
          tags: [this.categoryStore.getCategoryName(p.categoryId)],
          unitLabel: ''
        }));

        this.searchResults.set([...bundleItems, ...productItems]);
        this.loading.set(false);
      },
      error: () => {
        this.searchResults.set([]);
        this.loading.set(false);
      }
    });
  }

  protected updateQuery(value: string): void {
    this.query = value;
  }

  protected submitSearch(query: string): void {
    const cleanQuery = query.trim();

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: cleanQuery ? { q: cleanQuery } : {},
      replaceUrl: true
    });

    this.query = cleanQuery;
    this.loadData();
  }
}
