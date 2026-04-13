import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FanCardComponent } from './fan-card.component';
import { ThemeService } from '../../../../core/services/theme.service';

describe('FanCardComponent', () => {
  let fixture: ComponentFixture<FanCardComponent>;
  let component: FanCardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FanCardComponent],
      providers: [
        {
          provide: ThemeService,
          useValue: {
            theme: () => 'dark',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FanCardComponent);
    component = fixture.componentInstance;
  });

  it('computes the speed percent from rpm and maxReference', () => {
    component.rpm = 1800;
    component.maxReference = 2400;

    expect(component.speedPercent).toBe(75);
    expect(component.animationClass).toBe('fan-rotate-80');
  });

  it('falls back to the power percentage when maxReference is not available', () => {
    component.maxReference = 0;
    component.power = 42;
    component.maxAirflow = 100;

    expect(component.speedPercent).toBe(42);
    expect(component.airflow).toBe(42);
  });

  it('normalizes the airflow unit label for cfm and m3h', () => {
    component.airflowUnit = 'cfm';
    expect(component.airflowUnitLabel).toBe('CFM');

    component.airflowUnit = 'm3h';
    expect(component.airflowUnitLabel).toBe('m³/h');
  });
});
