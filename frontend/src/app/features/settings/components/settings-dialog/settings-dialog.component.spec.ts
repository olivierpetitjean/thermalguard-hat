import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SettingsDialogComponent } from './settings-dialog.component';
import { ConfigService } from '../../../../core/services/config.service';

describe('SettingsDialogComponent', () => {
  let fixture: ComponentFixture<SettingsDialogComponent>;
  let component: SettingsDialogComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ConfigService,
          useValue: {
            apiBaseUrl: 'http://thermalguard.local/api',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsDialogComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads rules and converts threshold values when the UI uses Fahrenheit', () => {
    fixture.detectChanges();

    httpMock.expectOne('http://thermalguard.local/api/config').flush({
      Display: {
        Sensor1Name: 'Rack',
        Sensor2Name: 'Ambient',
        Fan1Name: 'Intake',
        Fan2Name: 'Exhaust',
        TemperatureUnit: 'F',
      },
    });

    httpMock.expectOne('http://thermalguard.local/api/settings').flush({
      Data: [
        {
          Auto: true,
          LinkedMode: true,
          Fan1Pwr: 15,
          Fan2Pwr: 15,
          Beep: false,
          SmtpEnable: false,
          SmtpSsl: false,
        },
      ],
    });

    httpMock.expectOne('http://thermalguard.local/api/conditions').flush({
      Data: [
        {
          MinTemp1: 25,
          MinTemp2: 25,
          Value1: 30,
          Value2: 30,
        },
      ],
    });

    expect(component.loading).toBe(false);
    expect(component.display.temperatureUnit).toBe('F');
    expect(component.temperatureInputMax).toBe(212);
    expect(component.rules).toHaveLength(1);
    expect(component.rules[0].threshold).toBe(77);
    expect(component.rules[0].minTemp1).toBe(77);
    expect(component.rules[0].minTemp2).toBe(77);
  });

  it('sorts loaded rules by ascending temperature before displaying them', () => {
    fixture.detectChanges();

    httpMock.expectOne('http://thermalguard.local/api/config').flush({
      Display: {
        TemperatureUnit: 'C',
      },
    });

    httpMock.expectOne('http://thermalguard.local/api/settings').flush({
      Data: [
        {
          Auto: true,
          LinkedMode: true,
          Fan1Pwr: 20,
          Fan2Pwr: 25,
          Beep: false,
          SmtpEnable: false,
          SmtpSsl: false,
        },
      ],
    });

    httpMock.expectOne('http://thermalguard.local/api/conditions').flush({
      Data: [
        { MinTemp1: 35, MinTemp2: 35, Value1: 60, Value2: 60 },
        { MinTemp1: 25, MinTemp2: 25, Value1: 20, Value2: 20 },
        { MinTemp1: 30, MinTemp2: 30, Value1: 40, Value2: 40 },
      ],
    });

    expect(component.rules.map((rule) => rule.threshold)).toEqual([25, 30, 35]);
  });

  it('adds a linked rule using the previous threshold and linked defaults', () => {
    component.rules = [
      { threshold: 25, minTemp1: 25, minTemp2: 25, value1: 15, value2: 15 },
    ];
    component.linkedMode = true;

    component.addRule();

    expect(component.rules).toHaveLength(2);
    expect(component.rules[1]).toEqual({
      threshold: 30,
      minTemp1: 30,
      minTemp2: 30,
      value1: 30,
      value2: 30,
    });
  });

  it('switches to independent mode while preserving threshold-derived values', () => {
    component.rules = [
      { threshold: 35, minTemp1: 10, minTemp2: 12, value1: 40, value2: 45 },
    ];

    component.onModeChanged('independent');

    expect(component.linkedMode).toBe(false);
    expect(component.rules[0]).toEqual({
      threshold: 35,
      minTemp1: 10,
      minTemp2: 12,
      value1: 40,
      value2: 45,
    });

    component.onModeChanged('linked');

    expect(component.linkedMode).toBe(true);
    expect(component.rules[0].minTemp1).toBe(35);
    expect(component.rules[0].minTemp2).toBe(35);
  });

  it('saves sorted temperature conditions and persists the settings row', () => {
    fixture.detectChanges();

    httpMock.expectOne('http://thermalguard.local/api/config').flush({
      Display: {
        TemperatureUnit: 'C',
      },
    });

    httpMock.expectOne('http://thermalguard.local/api/settings').flush({
      Data: [
        {
          Auto: false,
          LinkedMode: false,
          Fan1Pwr: 42,
          Fan2Pwr: 55,
          Beep: true,
          SmtpEnable: true,
          Smtp_host: 'smtp.local',
          SmtpPort: '2525',
          SmtpSender: 'bot@test.local',
          SmtpLogin: 'bot',
          SmtpSsl: true,
        },
      ],
    });

    httpMock.expectOne('http://thermalguard.local/api/conditions').flush({
      Data: [],
    });

    component.linkedMode = false;
    component.rules = [
      { threshold: 40, minTemp1: 35, minTemp2: 37, value1: 80.4, value2: 70.2 },
      { threshold: 20, minTemp1: 25, minTemp2: 24, value1: 20.6, value2: 21.4 },
    ];

    component.save();

    const conditionsRequest = httpMock.expectOne('http://thermalguard.local/api/conditions');
    expect(conditionsRequest.request.method).toBe('POST');
    expect(conditionsRequest.request.body).toEqual([
      { MinTemp1: 25, MinTemp2: 24, Value1: 21, Value2: 21 },
      { MinTemp1: 35, MinTemp2: 37, Value1: 80, Value2: 70 },
    ]);
    conditionsRequest.flush({});

    const settingsRequest = httpMock.expectOne('http://thermalguard.local/api/settings');
    expect(settingsRequest.request.method).toBe('POST');
    expect(settingsRequest.request.body).toEqual({
      Auto: false,
      LinkedMode: false,
      Fan1Pwr: 42,
      Fan2Pwr: 55,
      Beep: true,
      SmtpEnable: true,
      Smtp_host: 'smtp.local',
      SmtpPort: '2525',
      SmtpSender: 'bot@test.local',
      SmtpLogin: 'bot',
      SmtpSsl: true,
    });
    settingsRequest.flush({});

    expect(component.saving).toBe(false);
    expect(component.saveError).toBe('');
    expect(component.saveSuccess).toBe('Rules saved.');
    expect(component.originalRules).toEqual(component.rules);
  });

  it('converts Fahrenheit rule values back to Celsius before saving linked rules', () => {
    fixture.detectChanges();

    httpMock.expectOne('http://thermalguard.local/api/config').flush({
      Display: {
        TemperatureUnit: 'F',
      },
    });

    httpMock.expectOne('http://thermalguard.local/api/settings').flush({
      Data: [
        {
          Auto: true,
          LinkedMode: true,
          Fan1Pwr: 20,
          Fan2Pwr: 25,
          Beep: false,
          SmtpEnable: false,
          SmtpSsl: false,
        },
      ],
    });

    httpMock.expectOne('http://thermalguard.local/api/conditions').flush({
      Data: [],
    });

    component.linkedMode = true;
    component.rules = [
      { threshold: 77, minTemp1: 77, minTemp2: 77, value1: 30, value2: 35 },
      { threshold: 95, minTemp1: 95, minTemp2: 95, value1: 80, value2: 85 },
    ];

    component.save();

    const conditionsRequest = httpMock.expectOne('http://thermalguard.local/api/conditions');
    expect(conditionsRequest.request.body).toEqual([
      { MinTemp1: 25, MinTemp2: 25, Value1: 30, Value2: 35 },
      { MinTemp1: 35, MinTemp2: 35, Value1: 80, Value2: 85 },
    ]);
    conditionsRequest.flush({});

    const settingsRequest = httpMock.expectOne('http://thermalguard.local/api/settings');
    settingsRequest.flush({});

    expect(component.saveSuccess).toBe('Rules saved.');
  });

  it('reverts the current rules to the original snapshot on reset', () => {
    fixture.detectChanges();

    httpMock.expectOne('http://thermalguard.local/api/config').flush({
      Display: {
        TemperatureUnit: 'C',
      },
    });

    httpMock.expectOne('http://thermalguard.local/api/settings').flush({
      Data: [
        {
          Auto: true,
          LinkedMode: true,
          Fan1Pwr: 20,
          Fan2Pwr: 25,
          Beep: false,
          SmtpEnable: false,
          SmtpSsl: false,
        },
      ],
    });

    httpMock.expectOne('http://thermalguard.local/api/conditions').flush({
      Data: [
        {
          MinTemp1: 25,
          MinTemp2: 25,
          Value1: 30,
          Value2: 30,
        },
      ],
    });

    component.rules = [
      { threshold: 40, minTemp1: 40, minTemp2: 40, value1: 90, value2: 95 },
    ];
    component.saveError = 'broken';
    component.saveSuccess = 'ok';

    component.reset();

    expect(component.rules).toEqual([
      { threshold: 25, minTemp1: 25, minTemp2: 25, value1: 30, value2: 30 },
    ]);
    expect(component.saveError).toBe('');
    expect(component.saveSuccess).toBe('');
  });
});
