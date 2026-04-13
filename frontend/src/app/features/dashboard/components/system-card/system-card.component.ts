import { CommonModule } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { ThemeService } from '../../../../core/services/theme.service';

@Component({
  selector: 'app-system-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './system-card.component.html',
  styleUrl: './system-card.component.css',
})
export class SystemCardComponent {
  private readonly themeService = inject(ThemeService);

  @Input({ required: true }) systemTemp = 0;
  @Input({ required: true }) current = 0;
  @Input({ required: true }) systemFan = false;
  @Input() locale = 'fr-FR';
  @Input() temperatureUnit = 'C';

  get iconPath(): string {
    return this.themeService.theme() === 'light'
      ? '/assets/images/circuit-board-dark.png'
      : '/assets/images/circuit-board.png';
  }

  get formattedTemperature(): string {
    const value = this.temperatureUnit === 'F'
      ? (this.systemTemp * 9) / 5 + 32
      : this.systemTemp;

    return new Intl.NumberFormat(this.locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
}
