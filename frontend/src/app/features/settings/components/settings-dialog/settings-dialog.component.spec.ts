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

  it('loads linked fan settings and converts threshold values when the UI uses Fahrenheit', () => {
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
          ControlMode: 'linked_fans',
          LinkedSensor: 'sensor2',
          DifferentialMode: 'sensor1_minus_sensor2',
          Fan1Pwr: 15,
          Fan2Pwr: 15,
          Beep: false,
          DisableFanAlerts: true,
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
    expect(component.controlMode).toBe('linked_fans');
    expect(component.linkedSensor).toBe('sensor2');
    expect(component.display.temperatureUnit).toBe('F');
    expect(component.disableFanAlerts).toBe(true);
    expect(component.rules).toHaveLength(1);
    expect(component.rules[0].threshold).toBe(77);
  });

  it('sorts loaded rules by ascending temperature in linked fan mode', () => {
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
          ControlMode: 'linked_fans',
          LinkedSensor: 'sensor1',
          DifferentialMode: 'sensor1_minus_sensor2',
          Fan1Pwr: 20,
          Fan2Pwr: 25,
          Beep: false,
          DisableFanAlerts: false,
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

  it('switches to independent mode while keeping rule temperatures available', () => {
    component.rules = [
      { threshold: 35, minTemp1: 35, minTemp2: 35, value1: 40, value2: 40 },
    ];

    component.onModeChanged('independent');

    expect(component.controlMode).toBe('independent');
    expect(component.rules[0]).toEqual({
      threshold: 35,
      minTemp1: 35,
      minTemp2: 35,
      value1: 40,
      value2: 40,
    });
  });

  it('switches to linked fan mode and collapses fan outputs to one shared curve', () => {
    component.controlMode = 'independent';
    component.rules = [
      { threshold: 35, minTemp1: 32, minTemp2: 28, value1: 40, value2: 65 },
    ];

    component.onModeChanged('linked_fans');

    expect(component.controlMode).toBe('linked_fans');
    expect(component.rules[0]).toEqual({
      threshold: 32,
      minTemp1: 32,
      minTemp2: 32,
      value1: 65,
      value2: 65,
    });
  });

  it('saves independent conditions and persists the selected control mode', () => {
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
          ControlMode: 'independent',
          LinkedSensor: 'sensor1',
          DifferentialMode: 'sensor1_minus_sensor2',
          Fan1Pwr: 42,
          Fan2Pwr: 55,
          Beep: true,
          DisableFanAlerts: true,
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

    component.controlMode = 'independent';
    component.disableFanAlerts = false;
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
      ControlMode: 'independent',
      LinkedSensor: 'sensor1',
      DifferentialMode: 'sensor1_minus_sensor2',
      Fan1Pwr: 42,
      Fan2Pwr: 55,
      Beep: true,
      DisableFanAlerts: false,
      SmtpEnable: true,
      Smtp_host: 'smtp.local',
      SmtpPort: '2525',
      SmtpSender: 'bot@test.local',
      SmtpLogin: 'bot',
      SmtpSsl: true,
    });
    settingsRequest.flush({});

    expect(component.saving).toBe(false);
    expect(component.saveSuccess).toBe('Rules saved.');
  });

  it('saves linked fan conditions with one shared threshold and one shared fan value', () => {
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
          ControlMode: 'linked_fans',
          LinkedSensor: 'sensor2',
          DifferentialMode: 'sensor1_minus_sensor2',
          Fan1Pwr: 20,
          Fan2Pwr: 25,
          Beep: false,
          DisableFanAlerts: false,
          SmtpEnable: false,
          SmtpSsl: false,
        },
      ],
    });

    httpMock.expectOne('http://thermalguard.local/api/conditions').flush({
      Data: [],
    });

    component.controlMode = 'linked_fans';
    component.linkedSensor = 'sensor2';
    component.rules = [
      { threshold: 25, minTemp1: 25, minTemp2: 25, value1: 30, value2: 30 },
      { threshold: 35, minTemp1: 35, minTemp2: 35, value1: 80, value2: 80 },
    ];

    component.save();

    const conditionsRequest = httpMock.expectOne('http://thermalguard.local/api/conditions');
    expect(conditionsRequest.request.body).toEqual([
      { MinTemp1: 25, MinTemp2: 25, Value1: 30, Value2: 30 },
      { MinTemp1: 35, MinTemp2: 35, Value1: 80, Value2: 80 },
    ]);
    conditionsRequest.flush({});

    const settingsRequest = httpMock.expectOne('http://thermalguard.local/api/settings');
    expect(settingsRequest.request.body.ControlMode).toBe('linked_fans');
    expect(settingsRequest.request.body.LinkedSensor).toBe('sensor2');
    settingsRequest.flush({});

    expect(component.saveSuccess).toBe('Rules saved.');
  });

  it('saves differential rules and keeps the chosen delta direction', () => {
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
          ControlMode: 'differential',
          LinkedSensor: 'sensor1',
          DifferentialMode: 'sensor2_minus_sensor1',
          Fan1Pwr: 20,
          Fan2Pwr: 25,
          Beep: false,
          DisableFanAlerts: false,
          SmtpEnable: false,
          SmtpSsl: false,
        },
      ],
    });

    httpMock.expectOne('http://thermalguard.local/api/conditions').flush({
      Data: [],
    });

    component.controlMode = 'differential';
    component.differentialMode = 'sensor2_minus_sensor1';
    component.rules = [
      { threshold: 41, minTemp1: 41, minTemp2: 41, value1: 30, value2: 30 },
      { threshold: 50, minTemp1: 50, minTemp2: 50, value1: 80, value2: 80 },
    ];

    component.save();

    const conditionsRequest = httpMock.expectOne('http://thermalguard.local/api/conditions');
    expect(conditionsRequest.request.body).toEqual([
      { MinTemp1: 5, MinTemp2: 5, Value1: 30, Value2: 30 },
      { MinTemp1: 10, MinTemp2: 10, Value1: 80, Value2: 80 },
    ]);
    conditionsRequest.flush({});

    const settingsRequest = httpMock.expectOne('http://thermalguard.local/api/settings');
    expect(settingsRequest.request.body.ControlMode).toBe('differential');
    expect(settingsRequest.request.body.DifferentialMode).toBe('sensor2_minus_sensor1');
    settingsRequest.flush({});

    expect(component.saveSuccess).toBe('Rules saved.');
  });

  it('reverts the current rules and mode selections to the original snapshot on reset', () => {
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
          ControlMode: 'linked_fans',
          LinkedSensor: 'sensor1',
          DifferentialMode: 'sensor1_minus_sensor2',
          Fan1Pwr: 20,
          Fan2Pwr: 25,
          Beep: false,
          DisableFanAlerts: true,
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

    component.controlMode = 'differential';
    component.linkedSensor = 'sensor2';
    component.differentialMode = 'sensor2_minus_sensor1';
    component.disableFanAlerts = false;
    component.rules = [
      { threshold: 40, minTemp1: 40, minTemp2: 40, value1: 90, value2: 95 },
    ];
    component.saveError = 'broken';
    component.saveSuccess = 'ok';

    component.reset();

    expect(component.controlMode).toBe('linked_fans');
    expect(component.linkedSensor).toBe('sensor1');
    expect(component.differentialMode).toBe('sensor1_minus_sensor2');
    expect(component.disableFanAlerts).toBe(true);
    expect(component.rules).toEqual([
      { threshold: 25, minTemp1: 25, minTemp2: 25, value1: 30, value2: 30 },
    ]);
    expect(component.saveError).toBe('');
    expect(component.saveSuccess).toBe('');
  });
});
