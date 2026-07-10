import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { TabsModule } from 'primeng/tabs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { BrandsSectionComponent } from './brands-section.component';
import { CategoriesSectionComponent } from './categories-section.component';
import { PriceCategoriesSectionComponent } from './price-categories-section.component';
import { MeasurementUnitsSectionComponent } from './measurement-units-section.component';
import { ClassificationsSectionComponent } from './classifications-section.component';

@Component({
  selector: 'app-inventario-section',
  standalone: true,
  imports: [
    CommonModule, TabsModule,
    BrandsSectionComponent, CategoriesSectionComponent,
    PriceCategoriesSectionComponent, MeasurementUnitsSectionComponent,
    ClassificationsSectionComponent,
  ],
  template: `
    <p-tabs [value]="firstTab()">
      <p-tablist>
        @if (canViewBrands()) {
          <p-tab value="brands">Marcas</p-tab>
        }
        @if (canViewCategories()) {
          <p-tab value="categories">Categorias</p-tab>
        }
        @if (canViewPriceCategories()) {
          <p-tab value="price-categories">Categorias de Precio</p-tab>
        }
        @if (canViewMeasurementUnits()) {
          <p-tab value="measurement-units">Unidades de Medida</p-tab>
          <p-tab value="classifications">Clasificaciones</p-tab>
        }
      </p-tablist>
      <p-tabpanels>
        @if (canViewBrands()) {
          <p-tabpanel value="brands">
            <app-brands-section />
          </p-tabpanel>
        }
        @if (canViewCategories()) {
          <p-tabpanel value="categories">
            <app-categories-section />
          </p-tabpanel>
        }
        @if (canViewPriceCategories()) {
          <p-tabpanel value="price-categories">
            <app-price-categories-section />
          </p-tabpanel>
        }
        @if (canViewMeasurementUnits()) {
          <p-tabpanel value="measurement-units">
            <app-measurement-units-section />
          </p-tabpanel>
          <p-tabpanel value="classifications">
            <app-classifications-section />
          </p-tabpanel>
        }
      </p-tabpanels>
    </p-tabs>
  `,
  styles: [`
    :host {
      display: block;
    }
    :host ::ng-deep .p-tabpanels {
      padding-top: 0.75rem;
    }
  `],
})
export class InventarioSectionComponent {
  private readonly authStore = inject(AuthStore);

  protected readonly canViewBrands = computed(() => this.authStore.hasPermission('brand:view'));
  protected readonly canViewCategories = computed(() => this.authStore.hasPermission('category:view'));
  protected readonly canViewPriceCategories = computed(() => this.authStore.hasPermission('price_category:view'));
  protected readonly canViewMeasurementUnits = computed(() => this.authStore.hasPermission('measurement_unit:view'));

  protected readonly firstTab = computed(() => {
    if (this.canViewBrands()) return 'brands';
    if (this.canViewCategories()) return 'categories';
    if (this.canViewPriceCategories()) return 'price-categories';
    if (this.canViewMeasurementUnits()) return 'measurement-units';
    return 'brands';
  });
}
