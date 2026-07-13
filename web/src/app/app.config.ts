import { APP_INITIALIZER, ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';

import { routes } from './app.routes';
import { API_BASE_URL } from './pages/auth-page/auth-api-go.service';
import { loadingInterceptor } from './core/loading/loading.interceptor';
import { authInterceptor } from './core/auth/auth.interceptor';
import { initializeAuth } from './core/auth/auth-init';
import { initializeSystemConfig } from './core/stores/system-config-init';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([loadingInterceptor, authInterceptor])),
    provideAnimationsAsync(),
    MessageService,
    {
      provide: API_BASE_URL,
      useValue: environment.apiBaseUrl
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeAuth,
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeSystemConfig,
      multi: true,
    },
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          prefix: 'p',
          darkModeSelector: 'none',
          cssLayer: false
        }
      }
    })
  ]
};
