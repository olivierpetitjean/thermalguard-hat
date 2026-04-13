import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Title } from '@angular/platform-browser';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { FanCardComponent } from '../components/fan-card/fan-card.component';
import { GraphsSectionComponent } from '../components/graphs-section/graphs-section.component';
import { HumidityCardComponent } from '../components/humidity-card/humidity-card.component';
import { SensorCardComponent } from '../components/sensor-card/sensor-card.component';
import { ServiceCardComponent } from '../components/service-card/service-card.component';
import { SystemCardComponent } from '../components/system-card/system-card.component';
import { SystemInfoDialogComponent } from '../components/system-info-dialog/system-info-dialog.component';
import { SettingsDialogComponent } from '../../settings/components/settings-dialog/settings-dialog.component';
import { AuthService } from '../../../core/services/auth.service';
import { ConfigService } from '../../../core/services/config.service';
import { MqttService } from '../../../core/services/mqtt.service';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FanCardComponent,
    GraphsSectionComponent,
    HumidityCardComponent,
    MatIconModule,
    SensorCardComponent,
    ServiceCardComponent,
    SystemCardComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit, OnDestroy {
  appLoading = true;
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
  serviceStatus = 0;
  serviceTime = '';
  isMqttConnected = false;
  autoWaiting = false;
  serviceCommandWait = false;
  boostPending = false;
  boostEnabled = false;
  boostRemain = 0;
  boostRemainText = '';
  boostCancelPending = false;
  lastBoostValue = 60;
  private manualModeDebounce?: ReturnType<typeof setTimeout>;
  private pendingInitialRequests = 4;
  private liveDataReady = false;
  private initialMqttFallback?: ReturnType<typeof setTimeout>;
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
  protected readonly themeService = inject(ThemeService);

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly mqttService = inject(MqttService);
  private readonly dialog = inject(MatDialog);
  private readonly title = inject(Title);
  private readonly subscriptions = new Subscription();

  ngOnInit(): void {
    this.updatePageTitle();
    this.loadDisplayConfig();
    this.loadSettings();
    this.loadServiceStatus();
    this.loadMaxReferences();
    this.bindMqtt();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.mqttService.disconnect();
    if (this.manualModeDebounce) {
      clearTimeout(this.manualModeDebounce);
    }
    if (this.initialMqttFallback) {
      clearTimeout(this.initialMqttFallback);
    }
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigate(['/login']);
  }

  onAutoChanged(auto: boolean): void {
    const lastValue = this.settings?.Auto ?? false;
    this.autoWaiting = true;

    this.mqttService.publish('modechanging', {
      Auto: auto,
      Fan1Pwr: this.settings?.Fan1Pwr ?? 0,
      Fan2Pwr: this.settings?.Fan2Pwr ?? 0,
    });

    setTimeout(() => {
      if (this.autoWaiting && this.settings) {
        this.settings.Auto = lastValue;
        this.autoWaiting = false;
      }
    }, 5000);
  }

  onFan1PowerChanged(power: number): void {
    if (this.settings) {
      this.settings.Fan1Pwr = power;
    }
    this.live.pwr1 = power;
    this.scheduleManualModePublish();
  }

  onFan2PowerChanged(power: number): void {
    if (this.settings) {
      this.settings.Fan2Pwr = power;
    }
    this.live.pwr2 = power;
    this.scheduleManualModePublish();
  }

  restartService(): void {
    this.serviceCommand('servicerestart');
  }

  startService(): void {
    this.serviceCommand('servicestart');
  }

  stopService(): void {
    this.serviceCommand('servicestop');
  }

  openSystemInfo(): void {
    const mobile = typeof window !== 'undefined' && window.innerWidth < 768;
    this.dialog.open(SystemInfoDialogComponent, {
      panelClass: 'system-info-dialog',
      width: mobile ? '100vw' : 'calc(100vw - 24px)',
      maxWidth: mobile ? '100vw' : '960px',
      height: mobile ? '100vh' : undefined,
      maxHeight: mobile ? '100vh' : '90vh',
    });
  }

  openSettings(): void {
    const mobile = typeof window !== 'undefined' && window.innerWidth < 768;
    this.dialog.open(SettingsDialogComponent, {
      panelClass: 'settings-dialog',
      width: mobile ? '100vw' : 'calc(100vw - 24px)',
      maxWidth: mobile ? '100vw' : '880px',
      height: mobile ? '100vh' : undefined,
      maxHeight: mobile ? '100vh' : '90vh',
    });
  }

  boost(delay: number): void {
    this.lastBoostValue = delay;
    this.boostPending = true;
    this.mqttService.publish('boost', { Value: delay, Request: 'SetBoost' });

    setTimeout(() => {
      if (!this.boostEnabled) {
        this.boostPending = false;
      }
    }, 5000);
  }

  cancelBoost(): void {
    this.boostCancelPending = true;
    this.mqttService.publish('boost', { Request: 'CancelBoost' });
  }

  private loadSettings(): void {
    this.http.get<ApiListResponse<SettingsRow>>(`${this.apiBaseUrl}/settings`).subscribe({
      next: (response) => {
        if (response.Success && response.Data.length > 0) {
          this.settings = response.Data[0];
        }
        this.completeInitialRequest();
      },
      error: () => {
        this.completeInitialRequest();
      },
    });
  }

  private loadDisplayConfig(): void {
    this.http.get<ConfigResponse>(`${this.apiBaseUrl}/config`).subscribe({
      next: (response) => {
        if (!response?.Display) {
          this.completeInitialRequest();
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
        this.completeInitialRequest();
      },
      error: () => {
        this.completeInitialRequest();
      },
    });
  }

  private loadServiceStatus(): void {
    this.http.get<ApiResponse<ServiceStatusResult>>(`${this.apiBaseUrl}/servicestatus`).subscribe({
      next: (response) => {
        if (!response.Success) {
          this.completeInitialRequest();
          return;
        }

        this.serviceStatusText = this.mapServiceStatus(response.Data.Status);
        this.serviceStatus = response.Data.Status;
        this.serviceTime = response.Data.Time.replace('CEST', '').trim();
        this.completeInitialRequest();
      },
      error: () => {
        this.completeInitialRequest();
      },
    });
  }

  private loadMaxReferences(): void {
    this.http.get<ApiResponse<MaxReferences>>(`${this.apiBaseUrl}/maxreferences`).subscribe({
      next: (response) => {
        if (response.Success) {
          this.maxReferences = response.Data;
        }
        this.completeInitialRequest();
      },
      error: () => {
        this.completeInitialRequest();
      },
    });
  }

  private bindMqtt(): void {
    this.subscriptions.add(
      this.mqttService.connectionState$.subscribe((connected) => {
        this.isMqttConnected = connected;
      }),
    );

    this.subscriptions.add(
      this.mqttService.messages$.subscribe((message) => {
        switch (message.topic) {
          case 'temperatures':
            this.live.temp1 = Number(message.payload.Temp1 ?? 0);
            this.live.temp2 = Number(message.payload.Temp2 ?? 0);
            this.completeInitialLiveLoad();
            break;
          case 'power':
            this.live.pwr1 = Number(message.payload.Pwr1 ?? 0);
            this.live.pwr2 = Number(message.payload.Pwr2 ?? 0);
            this.completeInitialLiveLoad();
            break;
          case 'rpm':
            this.live.rpm1 = Number(message.payload.Rpm1 ?? 0);
            this.live.rpm2 = Number(message.payload.Rpm2 ?? 0);
            this.completeInitialLiveLoad();
            break;
          case 'system':
            this.live.sysTemp = Number(message.payload.Temp ?? 0);
            this.live.humidity = Number(message.payload.Humidity ?? 0);
            this.live.current = Number(message.payload.Current ?? 0);
            this.live.sysFan = Boolean(message.payload.SysFan);
            this.completeInitialLiveLoad();
            break;
          case 'maxrefs':
            this.maxReferences = {
              Value1: Number(message.payload.fan1 ?? this.maxReferences?.Value1 ?? 0),
              Value2: Number(message.payload.fan2 ?? this.maxReferences?.Value2 ?? 0),
            };
            break;
          case 'servicestatuschanged':
            this.serviceStatus = Number(message.payload.status ?? 0);
            this.serviceStatusText = this.mapServiceStatus(this.serviceStatus);
            this.serviceTime = String(message.payload.time ?? '').replace('CEST', '').trim();
            break;
          case 'modechanged':
            if (message.payload.Success && this.settings) {
              this.autoWaiting = false;
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
    this.initialMqttFallback = setTimeout(() => {
      this.liveDataReady = true;
      this.tryFinishInitialLoad();
    }, 1500);
  }

  private handleBoost(payload: any): void {
    const request = payload?.Request;

    if (request === 'BoostStatus') {
      this.boostPending = false;
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
      this.boostCancelPending = false;
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

  private serviceCommand(action: 'servicerestart' | 'servicestart' | 'servicestop'): void {
    this.serviceCommandWait = true;
    this.http.get<ApiResponse<ServiceStatusResult>>(`${this.apiBaseUrl}/${action}`).subscribe({
      next: (response) => {
        this.serviceCommandWait = false;
        if (!response.Success) {
          return;
        }

        this.serviceStatus = response.Data.Status;
        this.serviceStatusText = this.mapServiceStatus(this.serviceStatus);
        this.serviceTime = response.Data.Time.replace('CEST', '').trim();
      },
      error: () => {
        this.serviceCommandWait = false;
      },
    });
  }

  private publishManualMode(): void {
    this.mqttService.publish('modechanging', {
      Auto: this.settings?.Auto ?? false,
      Fan1Pwr: this.settings?.Fan1Pwr ?? this.live.pwr1,
      Fan2Pwr: this.settings?.Fan2Pwr ?? this.live.pwr2,
    });
  }

  private scheduleManualModePublish(): void {
    if (this.manualModeDebounce) {
      clearTimeout(this.manualModeDebounce);
    }

    this.manualModeDebounce = setTimeout(() => {
      this.manualModeDebounce = undefined;
      this.publishManualMode();
    }, 350);
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

  private completeInitialRequest(): void {
    this.pendingInitialRequests = Math.max(0, this.pendingInitialRequests - 1);
    this.tryFinishInitialLoad();
  }

  private completeInitialLiveLoad(): void {
    if (this.liveDataReady) {
      return;
    }

    this.liveDataReady = true;
    if (this.initialMqttFallback) {
      clearTimeout(this.initialMqttFallback);
      this.initialMqttFallback = undefined;
    }
    this.tryFinishInitialLoad();
  }

  private tryFinishInitialLoad(): void {
    if (this.pendingInitialRequests === 0 && this.liveDataReady) {
      this.appLoading = false;
    }
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
