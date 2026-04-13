import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Title } from '@angular/platform-browser';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { FanCardComponent } from '../../dashboard/components/fan-card/fan-card.component';
import { HumidityCardComponent } from '../../dashboard/components/humidity-card/humidity-card.component';
import { SensorCardComponent } from '../../dashboard/components/sensor-card/sensor-card.component';
import { SystemCardComponent } from '../../dashboard/components/system-card/system-card.component';
import { KioskServiceCardComponent } from '../components/kiosk-service-card/kiosk-service-card.component';
import { ConfigService } from '../../../core/services/config.service';
import { MqttService } from '../../../core/services/mqtt.service';

@Component({
  selector: 'app-kiosk',
  standalone: true,
  imports: [
    CommonModule,
    FanCardComponent,
    HumidityCardComponent,
    KioskServiceCardComponent,
    SensorCardComponent,
    SystemCardComponent,
  ],
  templateUrl: './kiosk.component.html',
  styleUrl: './kiosk.component.css',
})
export class KioskComponent implements OnInit, OnDestroy {
  display = {
    dashboardTitle: 'Dashboard',
    sensor1Name: 'Rack',
    sensor2Name: 'Ambient',
    fan1Name: 'Intake Fan',
    fan2Name: 'Exhaust Fan',
    locale: 'en-US',
    temperatureUnit: 'C',
    disableFanAnimations: false,
    airflowUnit: 'm3h',
    fan1MaxAirflow: 95,
    fan2MaxAirflow: 95,
  };

  settings: SettingsRow | null = null;
  maxReferences: MaxReferences | null = null;
  serviceStatusText = '';
  serviceTime = '';
  boostEnabled = false;
  boostRemain = 0;
  boostRemainText = '';
  live = {
    temp1: 0,
    temp2: 0,
    pwr1: 0,
    pwr2: 0,
    rpm1: 0,
    rpm2: 0,
    sysTemp: 0,
    humidity: 0,
    current: 0,
    sysFan: false,
  };

  protected readonly apiBaseUrl = inject(ConfigService).apiBaseUrl;

  private readonly http = inject(HttpClient);
  private readonly mqttService = inject(MqttService);
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly subscriptions = new Subscription();
  rotation = 0;
  layoutMode: 'stacked' | 'inline' = 'stacked';

  ngOnInit(): void {
    this.updatePageTitle();
    this.bindRoute();
    this.loadDisplayConfig();
    this.loadSettings();
    this.loadServiceStatus();
    this.loadMaxReferences();
    this.bindMqtt();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.mqttService.disconnect();
  }

  get rotationViewportClass(): string {
    return this.rotation ? `kiosk-viewport--rotate-${this.rotation}` : '';
  }

  private loadSettings(): void {
    this.http.get<ApiListResponse<SettingsRow>>(`${this.apiBaseUrl}/settings`).subscribe({
      next: (response) => {
        if (response.Success && response.Data.length > 0) {
          this.settings = response.Data[0];
        }
      },
    });
  }

  private loadDisplayConfig(): void {
    this.http.get<ConfigResponse>(`${this.apiBaseUrl}/config`).subscribe({
      next: (response) => {
        if (!response?.Display) {
          return;
        }

        this.display = {
          dashboardTitle: response.Display.DashboardTitle || this.display.dashboardTitle,
          sensor1Name: response.Display.Sensor1Name || this.display.sensor1Name,
          sensor2Name: response.Display.Sensor2Name || this.display.sensor2Name,
          fan1Name: response.Display.Fan1Name || this.display.fan1Name,
          fan2Name: response.Display.Fan2Name || this.display.fan2Name,
          locale: response.Display.Locale || this.display.locale,
          temperatureUnit: response.Display.TemperatureUnit || this.display.temperatureUnit,
          disableFanAnimations: response.Display.DisableFanAnimations ?? this.display.disableFanAnimations,
          airflowUnit: response.Display.AirflowUnit || this.display.airflowUnit,
          fan1MaxAirflow: response.Display.Fan1MaxAirflow ?? this.display.fan1MaxAirflow,
          fan2MaxAirflow: response.Display.Fan2MaxAirflow ?? this.display.fan2MaxAirflow,
        };
        this.updatePageTitle();
      },
    });
  }

  private loadServiceStatus(): void {
    this.http.get<ApiResponse<ServiceStatusResult>>(`${this.apiBaseUrl}/servicestatus`).subscribe({
      next: (response) => {
        if (!response.Success) {
          return;
        }

        this.serviceStatusText = this.mapServiceStatus(response.Data.Status);
        this.serviceTime = response.Data.Time.replace('CEST', '').trim();
      },
    });
  }

  private loadMaxReferences(): void {
    this.http.get<ApiResponse<MaxReferences>>(`${this.apiBaseUrl}/maxreferences`).subscribe({
      next: (response) => {
        if (response.Success) {
          this.maxReferences = response.Data;
        }
      },
    });
  }

  private bindMqtt(): void {
    this.subscriptions.add(
      this.mqttService.messages$.subscribe((message) => {
        switch (message.topic) {
          case 'temperatures':
            this.live.temp1 = Number(message.payload.Temp1 ?? 0);
            this.live.temp2 = Number(message.payload.Temp2 ?? 0);
            break;
          case 'power':
            this.live.pwr1 = Number(message.payload.Pwr1 ?? 0);
            this.live.pwr2 = Number(message.payload.Pwr2 ?? 0);
            break;
          case 'rpm':
            this.live.rpm1 = Number(message.payload.Rpm1 ?? 0);
            this.live.rpm2 = Number(message.payload.Rpm2 ?? 0);
            break;
          case 'system':
            this.live.sysTemp = Number(message.payload.Temp ?? 0);
            this.live.humidity = Number(message.payload.Humidity ?? 0);
            this.live.current = Number(message.payload.Current ?? 0);
            this.live.sysFan = Boolean(message.payload.SysFan);
            break;
          case 'maxrefs':
            this.maxReferences = {
              Value1: Number(message.payload.fan1 ?? this.maxReferences?.Value1 ?? 0),
              Value2: Number(message.payload.fan2 ?? this.maxReferences?.Value2 ?? 0),
            };
            break;
          case 'servicestatuschanged':
            this.serviceStatusText = this.mapServiceStatus(Number(message.payload.status ?? 0));
            this.serviceTime = String(message.payload.time ?? '').replace('CEST', '').trim();
            break;
          case 'modechanged':
            if (message.payload.Success && this.settings) {
              this.settings.Auto = Boolean(message.payload.Auto);
              this.settings.Fan1Pwr = Number(message.payload.Fan1Pwr ?? this.settings.Fan1Pwr);
              this.settings.Fan2Pwr = Number(message.payload.Fan2Pwr ?? this.settings.Fan2Pwr);
              this.live.pwr1 = this.settings.Fan1Pwr;
              this.live.pwr2 = this.settings.Fan2Pwr;
            }
            break;
          case 'boost':
            this.handleBoost(message.payload);
            break;
          default:
            break;
        }
      }),
    );

    this.mqttService.connect();
    this.mqttService.publish('boost', { Request: 'GetBoost' });
  }

  private bindRoute(): void {
    this.subscriptions.add(
      this.route.queryParamMap.subscribe((params) => {
        const rawValue = params.get('rotate') ?? '0';
        const parsedValue = Number.parseInt(rawValue, 10);
        this.rotation = [0, 90, 180, 270].includes(parsedValue) ? parsedValue : 0;

        const mode = (params.get('mode') ?? '').trim().toLowerCase();
        this.layoutMode = mode === 'inline' ? 'inline' : 'stacked';
      }),
    );
  }

  private handleBoost(payload: any): void {
    const request = payload?.Request;

    if (request === 'BoostStatus') {
      this.boostRemain = Number(payload?.Expire ?? 0);
      if (this.boostRemain > 0) {
        this.boostEnabled = true;
        this.updateBoostCountdown();
      } else {
        this.boostEnabled = false;
        this.boostRemainText = '';
      }
      return;
    }

    if (request === 'CancelBoost') {
      this.boostRemain = 0;
      this.boostEnabled = false;
      this.boostRemainText = '';
    }
  }

  private updateBoostCountdown(): void {
    if (this.boostRemain <= 0) {
      this.boostEnabled = false;
      this.boostRemainText = '';
      return;
    }

    this.boostRemainText = this.formatDuration(this.boostRemain);
    setTimeout(() => {
      this.boostRemain -= 1;
      this.updateBoostCountdown();
    }, 1000);
  }

  private formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const remain = (seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remain}`;
  }

  private mapServiceStatus(status: number): string {
    switch (status) {
      case 1:
        return 'Running';
      case 2:
        return 'Stopped';
      default:
        return 'Unknown';
    }
  }

  private updatePageTitle(): void {
    this.title.setTitle(`${this.display.dashboardTitle} (ThermalGuard HAT)`);
  }
}

interface ApiResponse<T> {
  Success: boolean;
  Data: T;
}

interface ApiListResponse<T> {
  Success: boolean;
  Data: T[];
}

interface SettingsRow {
  Auto: boolean;
  Fan1Pwr: number;
  Fan2Pwr: number;
}

interface ServiceStatusResult {
  Status: number;
  Time: string;
}

interface MaxReferences {
  Value1: number;
  Value2: number;
}

interface ConfigResponse {
  MqttPath: string;
  Display: {
    DashboardTitle: string;
    Sensor1Name: string;
    Sensor2Name: string;
    Fan1Name: string;
    Fan2Name: string;
    Locale: string;
    TemperatureUnit: string;
    DisableFanAnimations?: boolean;
    AirflowUnit?: string;
    Fan1MaxAirflow?: number;
    Fan2MaxAirflow?: number;
  };
}
