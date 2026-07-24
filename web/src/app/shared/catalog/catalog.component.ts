import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { InputNumberModule } from 'primeng/inputnumber';

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
  canDecimalStock: boolean;
  unitSymbol: string;
  itemType: 'product' | 'bundle';
  items?: { name: string; quantity: number }[];
};

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, CardModule, TagModule, InputNumberModule],
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
  @Output() quantityChange = new EventEmitter<{ productId: string; quantity: number }>();
  @Output() addToCart = new EventEmitter<string>();
  @Output() productClick = new EventEmitter<string>();

  onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = '/not-found.png';
  }
}
