import { CommonModule } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { ThemeService } from '../../../../core/services/theme.service';

@Component({
  selector: 'app-kiosk-service-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kiosk-service-card.component.html',
  styleUrl: './kiosk-service-card.component.css',
})
export class KioskServiceCardComponent {
  private readonly themeService = inject(ThemeService);

  @Input({ required: true }) serviceStatusText = '';
  @Input({ required: true }) serviceTime = '';
  @Input({ required: true }) isAuto = false;
  @Input({ required: true }) boostEnabled = false;
  @Input({ required: true }) boostRemainText = '';

  get iconPath(): string {
    return this.themeService.theme() === 'light'
      ? '/assets/images/service-dark.png'
      : '/assets/images/service.png';
  }

  get statusClass(): string {
    return this.serviceStatusText === 'Running'
      ? 'success'
      : this.serviceStatusText === 'Stopped'
        ? 'error'
        : '';
  }
}
