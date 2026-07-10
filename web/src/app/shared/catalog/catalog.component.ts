import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';

type Category = {
  id: string;
  label: string;
};

type ProductCard = {
  id: string;
  name: string;
  price: string;
  description: string;
  imageUrl: string;
  alt: string;
  category: string;
  badge?: string;
  featured?: boolean;
  quantity: number;
  stockAvailable: number;
  itemType: 'product' | 'bundle';
  items?: { name: string; quantity: number }[];
};

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CommonModule, ButtonModule, CardModule, TagModule],
  templateUrl: './catalog.component.html',
  styleUrl: './catalog.component.scss'
})
export class CatalogComponent {
  @Input() categories: Category[] = [];
  @Input() selectedCategoryId = '';
  @Input() products: ProductCard[] = [];
  @Input() negativeStock = false;

  @Output() categorySelect = new EventEmitter<string>();
  @Output() increment = new EventEmitter<string>();
  @Output() decrement = new EventEmitter<string>();
  @Output() addToCart = new EventEmitter<string>();

  onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = '/not-found.png';
  }
}
