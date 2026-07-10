import { Component, inject } from '@angular/core';
import { SystemConfigStore } from '../../core/stores/system-config.store';

@Component({
  selector: 'app-footer',
  standalone: true,
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent {
  protected readonly config = inject(SystemConfigStore);

  protected onLogoError(event: Event): void {
    (event.target as HTMLImageElement).src = '/not-found.png';
  }
}
