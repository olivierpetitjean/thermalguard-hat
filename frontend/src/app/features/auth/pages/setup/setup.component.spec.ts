import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SetupComponent } from './setup.component';
import { ConfigService } from '../../../../core/services/config.service';

describe('SetupComponent', () => {
  let fixture: ComponentFixture<SetupComponent>;
  let component: SetupComponent;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SetupComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ConfigService,
          useValue: {
            apiBaseUrl: 'http://thermalguard.local/api',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SetupComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('creates the account and persists the fan alert preference when requested', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.username = 'admin';
    component.password = 'secret';
    component.confirm = 'secret';
    component.disableFanAlerts = true;

    component.submit();

    const setupRequest = httpMock.expectOne('http://thermalguard.local/api/auth/setup');
    expect(setupRequest.request.method).toBe('POST');
    setupRequest.flush({ Success: true, Token: 'jwt-token' });

    const settingsGet = httpMock.expectOne('http://thermalguard.local/api/settings');
    settingsGet.flush({
      Data: [
        {
          Auto: true,
          LinkedMode: true,
          ControlMode: 'linked_fans',
          LinkedSensor: 'sensor1',
          DifferentialMode: 'sensor1_minus_sensor2',
          Fan1Pwr: 15,
          Fan2Pwr: 15,
          Beep: true,
          DisableFanAlerts: false,
          SmtpEnable: false,
          SmtpSsl: false,
        },
      ],
    });

    const settingsPost = httpMock.expectOne('http://thermalguard.local/api/settings');
    expect(settingsPost.request.method).toBe('POST');
    expect(settingsPost.request.body.DisableFanAlerts).toBe(true);
    settingsPost.flush({ Success: true });

    await Promise.resolve();

    expect(component.loading).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });
});
