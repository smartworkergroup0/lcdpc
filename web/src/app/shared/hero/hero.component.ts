import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CarouselModule } from 'primeng/carousel';
import { CarouselPageEvent } from 'primeng/types/carousel';
import { CatalogSearchComponent } from '../catalog-search/catalog-search.component';

type HeroSlide = {
  title: string;
  imageUrl: string;
  alt: string;
};

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [CommonModule, CarouselModule, CatalogSearchComponent],
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.scss'
})
export class HeroComponent {
  @Input() heroSlides: HeroSlide[] = [];
  @Input() activeHeroIndex = 0;
  @Input() search = '';

  @Output() previous = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() slideSelect = new EventEmitter<number>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() searchSubmit = new EventEmitter<string>();

  protected onCarouselPage(event: CarouselPageEvent): void {
    this.slideSelect.emit(event.page ?? 0);
  }

  protected selectSlide(index: number): void {
    this.slideSelect.emit(index);
  }

  protected submitSearch(query: string): void {
    this.searchSubmit.emit(query);
  }

  onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = '/not-found.png';
  }
}
