import { CommonModule } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { ThemeService } from '../../../../core/services/theme.service';

@Component({
  selector: 'app-sensor-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sensor-card.component.html',
  styleUrl: './sensor-card.component.css',
})
export class SensorCardComponent {
  private readonly themeService = inject(ThemeService);

  @Input({ required: true }) title = '';
  @Input({ required: true }) temperature = 0;
  @Input({ required: true }) power = 0;
  @Input() locale = 'fr-FR';
  @Input() temperatureUnit = 'C';

  get iconPath(): string {
    return this.themeService.theme() === 'light'
      ? '/assets/images/temperature-dark.png'
      : '/assets/images/temperature.png';
  }

  get formattedTemperature(): string {
    const value = this.temperatureUnit === 'F'
      ? (this.temperature * 9) / 5 + 32
      : this.temperature;

    return new Intl.NumberFormat(this.locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
}
