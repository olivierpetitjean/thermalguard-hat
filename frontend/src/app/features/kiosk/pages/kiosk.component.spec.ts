import { convertToParamMap, ActivatedRoute } from '@angular/router';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Subject } from 'rxjs';
import { KioskComponent } from './kiosk.component';
import { ConfigService } from '../../../core/services/config.service';
import { MqttMessage, MqttService } from '../../../core/services/mqtt.service';

describe('KioskComponent', () => {
  let fixture: ComponentFixture<KioskComponent>;
  let component: KioskComponent;
  let httpMock: HttpTestingController;
  let title: Title;
  let queryParamMap$: Subject<ReturnType<typeof convertToParamMap>>;
  let mqttMessages$: Subject<MqttMessage>;
  let mqttServiceMock: {
    messages$: Subject<MqttMessage>;
    connectionState$: Subject<boolean>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.useFakeTimers();

    queryParamMap$ = new Subject();
    mqttMessages$ = new Subject<MqttMessage>();
    mqttServiceMock = {
      messages$: mqttMessages$,
      connectionState$: new Subject<boolean>(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      publish: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [KioskComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        {
          provide: ConfigService,
          useValue: {
            apiBaseUrl: 'http://thermalguard.local/api',
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: queryParamMap$.asObservable(),
          },
        },
        {
          provide: MqttService,
          useValue: mqttServiceMock,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(KioskComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    title = TestBed.inject(Title);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  it('loads kiosk state, updates the title and requests the boost status on init', () => {
    fixture.detectChanges();

    queryParamMap$.next(convertToParamMap({ rotate: '90', mode: 'inline' }));

    httpMock.expectOne('http://thermalguard.local/api/config').flush({
      Display: {
        DashboardTitle: 'Wallboard',
        Sensor1Name: 'Rack',
        Sensor2Name: 'Ambient',
        Fan1Name: 'Intake',
        Fan2Name: 'Exhaust',
        Locale: 'fr-FR',
        TemperatureUnit: 'F',
      },
    });
    httpMock.expectOne('http://thermalguard.local/api/settings').flush({
      Success: true,
      Data: [
        {
          Auto: true,
          Fan1Pwr: 35,
          Fan2Pwr: 50,
        },
      ],
    });
    httpMock.expectOne('http://thermalguard.local/api/servicestatus').flush({
      Success: true,
      Data: {
        Status: 1,
        Time: '2026-04-12 11:00 CEST',
      },
    });
    httpMock.expectOne('http://thermalguard.local/api/maxreferences').flush({
      Success: true,
      Data: {
        Value1: 2000,
        Value2: 2100,
      },
    });

    expect(mqttServiceMock.connect).toHaveBeenCalledOnce();
    expect(mqttServiceMock.publish).toHaveBeenCalledWith('boost', { Request: 'GetBoost' });
    expect(component.rotation).toBe(90);
    expect(component.layoutMode).toBe('inline');
    expect(component.rotationViewportClass).toBe('kiosk-viewport--rotate-90');
    expect(component.serviceStatusText).toBe('Running');
    expect(component.serviceTime).toBe('2026-04-12 11:00');
    expect(title.getTitle()).toBe('Wallboard (ThermalGuard HAT)');
  });

  it('falls back to safe route params when query params are invalid', () => {
    fixture.detectChanges();
    queryParamMap$.next(convertToParamMap({ rotate: '45', mode: 'stack' }));

    httpMock.expectOne('http://thermalguard.local/api/config').flush({});
    httpMock.expectOne('http://thermalguard.local/api/settings').flush({ Success: true, Data: [] });
    httpMock.expectOne('http://thermalguard.local/api/servicestatus').flush({ Success: false });
    httpMock.expectOne('http://thermalguard.local/api/maxreferences').flush({ Success: false });

    expect(component.rotation).toBe(0);
    expect(component.layoutMode).toBe('stacked');
    expect(component.rotationViewportClass).toBe('');
  });

  it('updates live data and boost state from MQTT messages', () => {
    fixture.detectChanges();
    queryParamMap$.next(convertToParamMap({}));

    httpMock.expectOne('http://thermalguard.local/api/config').flush({});
    httpMock.expectOne('http://thermalguard.local/api/settings').flush({
      Success: true,
      Data: [
        {
          Auto: false,
          Fan1Pwr: 25,
          Fan2Pwr: 30,
        },
      ],
    });
    httpMock.expectOne('http://thermalguard.local/api/servicestatus').flush({ Success: false });
    httpMock.expectOne('http://thermalguard.local/api/maxreferences').flush({ Success: false });

    mqttMessages$.next({ topic: 'temperatures', payload: { Temp1: 21, Temp2: 22 } });
    mqttMessages$.next({ topic: 'power', payload: { Pwr1: 33, Pwr2: 44 } });
    mqttMessages$.next({ topic: 'rpm', payload: { Rpm1: 1200, Rpm2: 1300 } });
    mqttMessages$.next({ topic: 'system', payload: { Temp: 41, Humidity: 56, Current: 1.2, SysFan: true } });
    mqttMessages$.next({ topic: 'modechanged', payload: { Success: true, Auto: true, Fan1Pwr: 35, Fan2Pwr: 45 } });
    mqttMessages$.next({ topic: 'boost', payload: { Request: 'BoostStatus', Expire: 2 } });

    expect(component.live.temp1).toBe(21);
    expect(component.live.temp2).toBe(22);
    expect(component.live.pwr1).toBe(35);
    expect(component.live.pwr2).toBe(45);
    expect(component.live.rpm1).toBe(1200);
    expect(component.live.rpm2).toBe(1300);
    expect(component.live.sysTemp).toBe(41);
    expect(component.live.humidity).toBe(56);
    expect(component.live.current).toBe(1.2);
    expect(component.live.sysFan).toBe(true);
    expect(component.settings?.Auto).toBe(true);
    expect(component.boostEnabled).toBe(true);
    expect(component.boostRemainText).toBe('00:02');

    vi.advanceTimersByTime(1000);
    expect(component.boostRemainText).toBe('00:01');
  });

  it('disconnects MQTT subscriptions on destroy', () => {
    fixture.detectChanges();
    queryParamMap$.next(convertToParamMap({}));

    httpMock.expectOne('http://thermalguard.local/api/config').flush({});
    httpMock.expectOne('http://thermalguard.local/api/settings').flush({ Success: true, Data: [] });
    httpMock.expectOne('http://thermalguard.local/api/servicestatus').flush({ Success: false });
    httpMock.expectOne('http://thermalguard.local/api/maxreferences').flush({ Success: false });

    fixture.destroy();

    expect(mqttServiceMock.disconnect).toHaveBeenCalledOnce();
  });
});
