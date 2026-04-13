import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SystemCardComponent } from './system-card.component';
import { ThemeService } from '../../../../core/services/theme.service';

describe('SystemCardComponent', () => {
  let fixture: ComponentFixture<SystemCardComponent>;
  let component: SystemCardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SystemCardComponent],
      providers: [
        {
          provide: ThemeService,
          useValue: {
            theme: () => 'dark',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SystemCardComponent);
    component = fixture.componentInstance;
  });

  it('formats the system temperature in Celsius', () => {
    component.systemTemp = 31.234;
    component.locale = 'en-US';
    component.temperatureUnit = 'C';

    expect(component.formattedTemperature).toBe('31.23');
  });

  it('converts the system temperature to Fahrenheit for display', () => {
    component.systemTemp = 31;
    component.locale = 'en-US';
    component.temperatureUnit = 'F';

    expect(component.formattedTemperature).toBe('87.80');
  });
});
