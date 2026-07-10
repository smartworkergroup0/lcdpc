import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

type HeroSlide = {
  title: string;
  imageUrl: string;
  alt: string;
};

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [CommonModule, ButtonModule, InputTextModule],
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

  protected currentHero(): HeroSlide | null {
    return this.heroSlides[this.activeHeroIndex] ?? null;
  }

  onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = '/not-found.png';
  }
}
