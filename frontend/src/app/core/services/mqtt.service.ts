import { Injectable, OnDestroy, inject } from '@angular/core';
import mqtt, { IClientOptions, MqttClient } from 'mqtt';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { ConfigService } from './config.service';

export interface MqttMessage {
  topic: string;
  payload: any;
}

@Injectable({ providedIn: 'root' })
export class MqttService implements OnDestroy {
  private client: MqttClient | null = null;
  private readonly authService = inject(AuthService);
  private readonly configService = inject(ConfigService);

  readonly messages$ = new Subject<MqttMessage>();
  readonly connectionState$ = new Subject<boolean>();

  connect(): void {
    if (this.client) {
      return;
    }

    const token = this.authService.getRequestToken() ?? '';
    const url = `${this.configService.mqttUrl}?token=${encodeURIComponent(token)}`;
    const options: IClientOptions = {
      reconnectPeriod: 15000,
      connectTimeout: 3000,
      clean: true,
    };

    this.client = mqtt.connect(url, options);

    this.client.on('connect', () => {
      this.connectionState$.next(true);
      this.client?.subscribe([
        'temperatures',
        'power',
        'rpm',
        'system',
        'maxrefs',
        'servicestatuschanged',
        'modechanged',
        'boost',
      ]);
    });

    this.client.on('message', (topic, payload) => {
      try {
        this.messages$.next({
          topic,
          payload: JSON.parse(payload.toString()),
        });
      } catch {
        this.messages$.next({
          topic,
          payload: payload.toString(),
        });
      }
    });

    this.client.on('error', () => {
      this.connectionState$.next(false);
    });

    this.client.on('offline', () => {
      this.connectionState$.next(false);
    });

    this.client.on('close', () => {
      this.connectionState$.next(false);
    });
  }

  disconnect(): void {
    this.client?.end(true);
    this.client = null;
  }

  publish(topic: string, payload: unknown): void {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    this.client?.publish(topic, body);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
