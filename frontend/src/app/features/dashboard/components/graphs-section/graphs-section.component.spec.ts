import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { GraphsSectionComponent } from './graphs-section.component';
import { ConfigService } from '../../../../core/services/config.service';

describe('GraphsSectionComponent', () => {
  let fixture: ComponentFixture<GraphsSectionComponent>;
  let component: GraphsSectionComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GraphsSectionComponent],
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
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GraphsSectionComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  it('loads the daily graph on init and maps temperature data', () => {
    fixture.detectChanges();

    const request = httpMock.expectOne((httpRequest) => httpRequest.url.includes('/graph/daily/'));
    expect(request.request.method).toBe('GET');

    request.flush([
      {
        Ts: 1710000000,
        Name: 'Sensor1',
        Value: 25.12567,
        MinValue: 24.5,
        MaxValue: 26.2,
      },
      {
        Ts: 1710000000,
        Name: 'System Temp.',
        Value: 31.2,
        MinValue: 30.9,
        MaxValue: 31.8,
      },
      {
        Ts: 1710000000,
        Name: 'Fan1 RPM',
        Value: 1200,
        MinValue: 1100,
        MaxValue: 1300,
      },
    ]);

    expect(component.loading).toBe(false);
    expect(component.graphData.get('sensor')).toEqual([
      {
        name: 'Rack',
        series: [
          {
            name: '1710000000',
            value: 25.1257,
            min: 24.5,
            max: 26.2,
          },
        ],
      },
      {
        name: 'System',
        series: [
          {
            name: '1710000000',
            value: 31.2,
            min: 30.9,
            max: 31.8,
          },
        ],
      },
    ]);
    expect(component.graphData.get('rpm')).toEqual([
      {
        name: 'Intake Fan',
        series: [
          {
            name: '1710000000',
            value: 1200,
            min: 1100,
            max: 1300,
          },
        ],
      },
    ]);

    const sensorBoundary = component.graphBoundaries.get('sensor');
    expect(sensorBoundary?.yScaleMin).toBe(23.5);
    expect(sensorBoundary?.yScaleMax).toBe(32.8);
  });

  it('converts temperature values to Fahrenheit when configured', () => {
    component.temperatureUnit = 'F';

    fixture.detectChanges();

    const request = httpMock.expectOne((httpRequest) => httpRequest.url.includes('/graph/daily/'));
    request.flush([
      {
        Ts: 1710000000,
        Name: 'Sensor1',
        Value: 25,
        MinValue: 24,
        MaxValue: 26,
      },
    ]);

    expect(component.graphData.get('sensor')).toEqual([
      {
        name: 'Rack',
        series: [
          {
            name: '1710000000',
            value: 77,
            min: 75.2,
            max: 78.8,
          },
        ],
      },
    ]);
  });

  it('disables future hours when the selected day is today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-12T10:15:00'));

    const updateGraphSpy = vi.spyOn(component as never, 'updateGraph' as never);
    component.selectedDate = new Date('2026-04-12T00:00:00');

    component.onSelectDateChange();

    expect(component.hours.find((item) => item.value === '10')?.disabled).toBe(false);
    expect(component.hours.find((item) => item.value === '11')?.disabled).toBe(true);
    expect(updateGraphSpy).not.toHaveBeenCalled();
  });

  it('switches from daily to hourly, then to period, when selecting chart points', () => {
    component.mode = 'daily';

    component.onChartSelect({ name: '1710000000' });

    expect(component.mode).toBe('hourly');
    const hourlyRequest = httpMock.expectOne((httpRequest) => httpRequest.url.includes('/graph/hourly/'));
    hourlyRequest.flush([]);

    component.onChartSelect({ name: '1710003600' });

    expect(component.mode).toBe('period');
    expect(component.selectedHour).toBe(new Date(1710003600 * 1000).getHours().toString());
    const periodRequest = httpMock.expectOne((httpRequest) => httpRequest.url.includes('/graph/period/'));
    periodRequest.flush([]);
  });
});
