import { Injectable, inject, signal } from '@angular/core';
import { SystemConfigApiService } from '../services/system-config-api.service';

@Injectable({ providedIn: 'root' })
export class SystemConfigStore {
  private readonly systemConfigApi = inject(SystemConfigApiService);

  private readonly _logoUrl = signal<string | null>(null);
  private readonly _iconUrl = signal<string | null>(null);
  private readonly _pageName = signal<string>('LCDPC');
  private readonly _title = signal<string>('LCDPC');
  private readonly _showPrice = signal(true);
  private readonly _negativeStock = signal(false);
  private loaded = false;

  readonly logoUrl = this._logoUrl.asReadonly();
  readonly iconUrl = this._iconUrl.asReadonly();
  readonly pageName = this._pageName.asReadonly();
  readonly title = this._title.asReadonly();
  readonly showPrice = this._showPrice.asReadonly();
  readonly negativeStock = this._negativeStock.asReadonly();

  load(): void {
    if (this.loaded) return;
    this.loaded = true;

    this.systemConfigApi.getLogo().subscribe({
      next: (url) => {
        if (url) {
          this._logoUrl.set(this.systemConfigApi.resolveImageUrl(url));
        }
      },
    });

    this.systemConfigApi.getIcon().subscribe({
      next: (url) => {
        if (url) {
          const resolved = this.systemConfigApi.resolveImageUrl(url);
          if (resolved) {
            this._iconUrl.set(resolved);
            this.setFavicon(resolved);
          }
        }
      },
    });

    this.systemConfigApi.getPageName().subscribe({
      next: (name) => {
        if (name) {
          this._pageName.set(name);
        }
      },
    });

    this.systemConfigApi.getTitle().subscribe({
      next: (title) => {
        if (title) {
          this._title.set(title);
          document.title = title;
        }
      },
    });

    this.systemConfigApi.getShowPrice().subscribe({
      next: (show) => this._showPrice.set(show),
    });

    this.systemConfigApi.getNegativeStock().subscribe({
      next: (negative) => this._negativeStock.set(negative),
    });
  }

  refresh(): void {
    this.loaded = false;
    this.load();
  }

  private setFavicon(url: string): void {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/x-icon';
    link.href = url;
  }
}
