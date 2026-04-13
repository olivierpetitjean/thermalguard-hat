import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SensorCardComponent } from './sensor-card.component';
import { ThemeService } from '../../../../core/services/theme.service';

describe('SensorCardComponent', () => {
  let fixture: ComponentFixture<SensorCardComponent>;
  let component: SensorCardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SensorCardComponent],
      providers: [
        {
          provide: ThemeService,
          useValue: {
            theme: () => 'dark',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SensorCardComponent);
    component = fixture.componentInstance;
  });

  it('formats Celsius temperatures with two decimals', () => {
    component.temperature = 25.126;
    component.locale = 'en-US';
    component.temperatureUnit = 'C';

    expect(component.formattedTemperature).toBe('25.13');
  });

  it('converts Celsius input to Fahrenheit for display when required', () => {
    component.temperature = 25;
    component.locale = 'en-US';
    component.temperatureUnit = 'F';

    expect(component.formattedTemperature).toBe('77.00');
  });
});
