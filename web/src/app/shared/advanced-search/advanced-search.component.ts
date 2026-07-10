import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnInit } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CategoryStore } from '../../core/stores/category.store';

export type SearchResultItem = {
  id: string;
  name: string;
  description: string;
  price: string;
  unitLabel: string;
  imageUrl: string;
  alt: string;
  tags: string[];
  featured?: boolean;
  promo?: string;
  oldPrice?: string;
  soldOut?: boolean;
};

@Component({
  selector: 'app-advanced-search',
  standalone: true,
  imports: [CommonModule, ButtonModule, CardModule],
  templateUrl: './advanced-search.component.html',
  styleUrl: './advanced-search.component.scss'
})
export class AdvancedSearchComponent implements OnInit {
  @Input() query = 'salchichas premium';
  @Input() results: SearchResultItem[] = [];

  readonly categoryStore = inject(CategoryStore);

  ngOnInit(): void {
    this.categoryStore.load();
  }

  onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = '/not-found.png';
  }
}
