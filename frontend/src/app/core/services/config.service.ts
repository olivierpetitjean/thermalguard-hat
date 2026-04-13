import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  get apiBaseUrl(): string {
    const apiOrigin = this.normalizeOrigin(environment.apiOrigin);
    return apiOrigin ? `${apiOrigin}/api` : environment.baseUrl;
  }

  get mqttUrl(): string {
    if (environment.mqttUrl?.trim()) {
      return environment.mqttUrl.trim();
    }

    const apiOrigin = this.normalizeOrigin(environment.apiOrigin);
    if (apiOrigin) {
      return `${apiOrigin.replace(/^http/i, 'ws')}/mqtt`;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/mqtt`;
  }

  private normalizeOrigin(origin: string): string {
    return (origin || '').trim().replace(/\/+$/, '');
  }
}
