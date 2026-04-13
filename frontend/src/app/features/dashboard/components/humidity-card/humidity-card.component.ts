import { CommonModule } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { ThemeService } from '../../../../core/services/theme.service';

@Component({
  selector: 'app-humidity-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './humidity-card.component.html',
  styleUrl: './humidity-card.component.css',
})
export class HumidityCardComponent {
  private readonly themeService = inject(ThemeService);

  @Input({ required: true }) humidity = 0;

  get iconPath(): string {
    return this.themeService.theme() === 'light'
      ? '/assets/images/humidity-dark.png'
      : '/assets/images/humidity.png';
  }
}
