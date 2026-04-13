import { CommonModule } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { ThemeService } from '../../../../core/services/theme.service';

@Component({
  selector: 'app-fan-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './fan-card.component.html',
  styleUrl: './fan-card.component.css',
})
export class FanCardComponent {
  private readonly themeService = inject(ThemeService);

  @Input({ required: true }) title = '';
  @Input({ required: true }) rpm = 0;
  @Input({ required: true }) power = 0;
  @Input({ required: true }) maxReference = 0;
  @Input() maxAirflow = 95;
  @Input() airflowUnit = 'm3h';
  @Input() disableAnimation = false;

  get shellPath(): string {
    return this.themeService.theme() === 'light'
      ? '/assets/images/fan-external-dark.png'
      : '/assets/images/fan-external.png';
  }

  get bladePath(): string {
    return this.themeService.theme() === 'light'
      ? '/assets/images/fan-interal-dark.png'
      : '/assets/images/fan-interal.png';
  }

  get status(): string {
    return this.rpm > 0 ? 'Online' : 'Offline';
  }

  get airflow(): number {
    return (this.speedPercent * this.maxAirflow) / 100;
  }

  get airflowUnitLabel(): string {
    return this.airflowUnit.toLowerCase() === 'cfm' ? 'CFM' : 'm³/h';
  }

  get speedPercent(): number {
    if (!this.maxReference) {
      return Math.max(0, Math.min(100, this.power ?? 0));
    }

    const percent = (this.rpm / this.maxReference) * 100;
    return Math.max(0, Math.min(100, percent));
  }

  get animationClass(): string {
    if (this.disableAnimation) return '';
    if (this.speedPercent >= 90) return 'fan-rotate-100';
    if (this.speedPercent >= 80) return 'fan-rotate-90';
    if (this.speedPercent >= 70) return 'fan-rotate-80';
    if (this.speedPercent >= 60) return 'fan-rotate-70';
    if (this.speedPercent >= 50) return 'fan-rotate-60';
    if (this.speedPercent >= 40) return 'fan-rotate-50';
    if (this.speedPercent >= 30) return 'fan-rotate-40';
    if (this.speedPercent >= 20) return 'fan-rotate-30';
    if (this.speedPercent >= 10) return 'fan-rotate-20';
    if (this.speedPercent > 0) return 'fan-rotate-10';
    return '';
  }
}
