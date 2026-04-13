import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { AuthService } from '../../../core/services/auth.service';
import { ConfigService } from '../../../core/services/config.service';
import { MqttMessage, MqttService } from '../../../core/services/mqtt.service';
import { ThemeService } from '../../../core/services/theme.service';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;
  let httpMock: HttpTestingController;
  let router: Router;
  let title: Title;
  let mqttMessages$: Subject<MqttMessage>;
  let mqttConnectionState$: Subject<boolean>;
  let mqttServiceMock: {
    messages$: Subject<MqttMessage>;
    connectionState$: Subject<boolean>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
  };
  let authServiceMock: {
    logout: ReturnType<typeof vi.fn>;
  };
  let dialogMock: {
    open: ReturnType<typeof vi.fn>;
  };
  let themeServiceMock: {
    theme: ReturnType<typeof vi.fn>;
    toggleTheme: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.useFakeTimers();

    mqttMessages$ = new Subject<MqttMessage>();
    mqttConnectionState$ = new Subject<boolean>();
    mqttServiceMock = {
      messages$: mqttMessages$,
      connectionState$: mqttConnectionState$,
      connect: vi.fn(),
      disconnect: vi.fn(),
      publish: vi.fn(),
    };
    authServiceMock = {
      logout: vi.fn(),
    };
    dialogMock = {
      open: vi.fn(),
    };
    themeServiceMock = {
      theme: vi.fn(() => 'dark'),
      toggleTheme: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: ConfigService,
          useValue: {
            apiBaseUrl: 'http://thermalguard.local/api',
          },
        },
        {
          provide: MqttService,
          useValue: mqttServiceMock,
        },
        {
          provide: AuthService,
          useValue: authServiceMock,
        },
        {
          provide: MatDialog,
          useValue: dialogMock,
        },
        {
          provide: ThemeService,
          useValue: themeServiceMock,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    title = TestBed.inject(Title);
  });

  afterEach(() => {
    httpMock.match(() => true).forEach((request) => request.flush([]));
    httpMock.verify();
    vi.useRealTimers();
  });

  function flushEmbeddedGraphsRequest(): void {
    const graphRequest = httpMock.expectOne((httpRequest) => httpRequest.url.includes('/graph/daily/'));
    graphRequest.flush([]);
  }

  it('loads initial HTTP state, connects MQTT and clears appLoading after live data arrives', () => {
    fixture.detectChanges();
    flushEmbeddedGraphsRequest();

    expect(mqttServiceMock.connect).toHaveBeenCalledOnce();
    expect(mqttServiceMock.publish).toHaveBeenCalledWith('boost', { Request: 'GetBoost' });

    httpMock.expectOne('http://thermalguard.local/api/config').flush({
      Display: {
        DashboardTitle: 'Server Room',
        Sensor1Name: 'Rack',
        Sensor2Name: 'Ambient',
        Fan1Name: 'Intake',
        Fan2Name: 'Exhaust',
        Locale: 'fr-FR',
        TemperatureUnit: 'C',
        DisableFanAnimations: true,
        AirflowUnit: 'cfm',
        Fan1MaxAirflow: 120,
        Fan2MaxAirflow: 125,
      },
    });

    httpMock.expectOne('http://thermalguard.local/api/settings').flush({
      Success: true,
      Data: [
        {
          Auto: true,
          Fan1Pwr: 35,
          Fan2Pwr: 45,
        },
      ],
    });

    httpMock.expectOne('http://thermalguard.local/api/servicestatus').flush({
      Success: true,
      Data: {
        Status: 1,
        Time: '2026-04-12 10:00 CEST',
      },
    });

    httpMock.expectOne('http://thermalguard.local/api/maxreferences').flush({
      Success: true,
      Data: {
        Value1: 2100,
        Value2: 2200,
      },
    });

    expect(component.appLoading).toBe(true);
    expect(title.getTitle()).toBe('Server Room (ThermalGuard HAT)');
    expect(component.serviceStatusText).toBe('Running');
    expect(component.serviceTime).toBe('2026-04-12 10:00');
    expect(component.maxReferences).toEqual({ Value1: 2100, Value2: 2200 });

    mqttConnectionState$.next(true);
    mqttMessages$.next({
      topic: 'temperatures',
      payload: {
        Temp1: 31.5,
        Temp2: 28.2,
      },
    });

    expect(component.isMqttConnected).toBe(true);
    expect(component.live.temp1).toBe(31.5);
    expect(component.live.temp2).toBe(28.2);
    expect(component.appLoading).toBe(false);
  });

  it('publishes mode changes and restores the previous auto state if no MQTT confirmation arrives', () => {
    component.settings = {
      Auto: true,
      Fan1Pwr: 40,
      Fan2Pwr: 55,
    };

    component.onAutoChanged(false);

    expect(component.autoWaiting).toBe(true);
    expect(mqttServiceMock.publish).toHaveBeenCalledWith('modechanging', {
      Auto: false,
      Fan1Pwr: 40,
      Fan2Pwr: 55,
    });

    vi.advanceTimersByTime(5000);

    expect(component.autoWaiting).toBe(false);
    expect(component.settings.Auto).toBe(true);
  });

  it('debounces slider commit events before publishing manual mode', () => {
    component.settings = {
      Auto: false,
      Fan1Pwr: 20,
      Fan2Pwr: 30,
    };

    component.onFan1PowerChanged(65);

    expect(component.live.pwr1).toBe(65);
    expect(mqttServiceMock.publish).not.toHaveBeenCalled();

    component.onFan2PowerChanged(70);

    expect(component.live.pwr2).toBe(70);
    vi.advanceTimersByTime(349);
    expect(mqttServiceMock.publish).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mqttServiceMock.publish).toHaveBeenLastCalledWith('modechanging', {
      Auto: false,
      Fan1Pwr: 65,
      Fan2Pwr: 70,
    });
  });

  it('updates live state from MQTT topics and handles boost countdowns', () => {
    fixture.detectChanges();
    flushEmbeddedGraphsRequest();

    httpMock.expectOne('http://thermalguard.local/api/config').flush({});
    httpMock.expectOne('http://thermalguard.local/api/settings').flush({ Success: true, Data: [] });
    httpMock.expectOne('http://thermalguard.local/api/servicestatus').flush({ Success: false });
    httpMock.expectOne('http://thermalguard.local/api/maxreferences').flush({ Success: false });

    mqttMessages$.next({
      topic: 'power',
      payload: { Pwr1: 30, Pwr2: 60 },
    });
    mqttMessages$.next({
      topic: 'rpm',
      payload: { Rpm1: 1100, Rpm2: 1350 },
    });
    mqttMessages$.next({
      topic: 'system',
      payload: { Temp: 42, Humidity: 51, Current: 1.4, SysFan: 1 },
    });
    mqttMessages$.next({
      topic: 'boost',
      payload: { Request: 'BoostStatus', Expire: 3 },
    });

    expect(component.live.pwr1).toBe(30);
    expect(component.live.pwr2).toBe(60);
    expect(component.live.rpm1).toBe(1100);
    expect(component.live.rpm2).toBe(1350);
    expect(component.live.sysTemp).toBe(42);
    expect(component.live.humidity).toBe(51);
    expect(component.live.current).toBe(1.4);
    expect(component.live.sysFan).toBe(true);
    expect(component.boostEnabled).toBe(true);
    expect(component.boostRemainText).toBe('00:03');

    vi.advanceTimersByTime(1000);
    expect(component.boostRemainText).toBe('00:02');

    mqttMessages$.next({
      topic: 'boost',
      payload: { Request: 'CancelBoost' },
    });

    expect(component.boostEnabled).toBe(false);
    expect(component.boostRemainText).toBe('');
  });

  it('logs out and navigates to /login', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.logout();

    expect(authServiceMock.logout).toHaveBeenCalledOnce();
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });

  it('opens the system info dialog with desktop sizing by default', () => {
    component.openSystemInfo();

    expect(dialogMock.open).toHaveBeenCalledOnce();
    expect(dialogMock.open.mock.calls[0][1]).toMatchObject({
      panelClass: 'system-info-dialog',
      width: 'calc(100vw - 24px)',
      maxWidth: '960px',
      maxHeight: '90vh',
    });
  });

  it('sends service commands through HTTP and updates the service status on success', () => {
    const getSpy = vi.spyOn(TestBed.inject(HttpClient), 'get');

    component.startService();

    expect(component.serviceCommandWait).toBe(true);

    const request = httpMock.expectOne('http://thermalguard.local/api/servicestart');
    expect(request.request.method).toBe('GET');
    request.flush({
      Success: true,
      Data: {
        Status: 2,
        Time: '2026-04-12 10:30 CEST',
      },
    });

    expect(getSpy).toHaveBeenCalled();
    expect(component.serviceCommandWait).toBe(false);
    expect(component.serviceStatus).toBe(2);
    expect(component.serviceStatusText).toBe('Stopped');
    expect(component.serviceTime).toBe('2026-04-12 10:30');
  });
});
