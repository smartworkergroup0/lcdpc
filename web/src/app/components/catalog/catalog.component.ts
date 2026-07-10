import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';

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
};

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  templateUrl: './catalog.component.html',
  styleUrl: './catalog.component.scss'
})
export class CatalogComponent {
  @Input() categories: Category[] = [];
  @Input() selectedCategoryId = '';
  @Input() products: ProductCard[] = [];

  @Output() categorySelect = new EventEmitter<string>();
  @Output() increment = new EventEmitter<void>();
  @Output() decrement = new EventEmitter<void>();

  onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = '/not-found.png';
  }
}
