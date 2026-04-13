import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { ThemeService } from '../../../../core/services/theme.service';

@Component({
  selector: 'app-service-card',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatDividerModule, MatIconModule, MatMenuModule, MatSlideToggleModule, MatSliderModule],
  templateUrl: './service-card.component.html',
  styleUrl: './service-card.component.css',
})
export class ServiceCardComponent {
  private readonly themeService = inject(ThemeService);
  private _fan1Power = 0;
  private _fan2Power = 0;

  @Input({ required: true }) serviceStatusText = '';
  @Input({ required: true }) serviceTime = '';
  @Input({ required: true }) isAuto = false;
  @Input({ required: true }) isMqttConnected = false;
  @Input({ required: true }) autoWaiting = false;
  @Input({ required: true }) serviceCommandWait = false;
  @Input({ required: true }) boostEnabled = false;
  @Input({ required: true }) boostRemainText = '';
  @Input({ required: true }) boostPending = false;
  @Input({ required: true }) boostCancelPending = false;
  @Input({ required: true }) lastBoostValue = 60;
  @Input({ required: true }) set fan1Power(value: number) {
    this._fan1Power = Number(value ?? 0);
    if (!this.fan1Dragging) {
      this.draftFan1Power = this._fan1Power;
    }
  }
  get fan1Power(): number {
    return this._fan1Power;
  }
  @Input({ required: true }) set fan2Power(value: number) {
    this._fan2Power = Number(value ?? 0);
    if (!this.fan2Dragging) {
      this.draftFan2Power = this._fan2Power;
    }
  }
  get fan2Power(): number {
    return this._fan2Power;
  }
  @Input() fan1Name = 'Intake Fan';
  @Input() fan2Name = 'Exhaust Fan';

  @Output() autoChanged = new EventEmitter<boolean>();
  @Output() fan1PowerChanged = new EventEmitter<number>();
  @Output() fan2PowerChanged = new EventEmitter<number>();
  @Output() restart = new EventEmitter<void>();
  @Output() start = new EventEmitter<void>();
  @Output() stop = new EventEmitter<void>();
  @Output() boost = new EventEmitter<number>();
  @Output() cancelBoost = new EventEmitter<void>();
  @Output() boostPresetChanged = new EventEmitter<number>();
  @Output() systemInfo = new EventEmitter<void>();

  protected readonly boostOptions = [60, 300, 600, 900, 1800];
  protected draftFan1Power = 0;
  protected draftFan2Power = 0;
  private fan1Dragging = false;
  private fan2Dragging = false;

  get iconPath(): string {
    return this.themeService.theme() === 'light'
      ? '/assets/images/service-dark.png'
      : '/assets/images/service.png';
  }

  protected selectBoostPreset(value: number): void {
    this.boostPresetChanged.emit(value);
  }

  protected runBoost(): void {
    this.boost.emit(this.lastBoostValue);
  }

  protected runAction(action: 'restart' | 'start' | 'stop'): void {
    if (action === 'restart') {
      this.restart.emit();
    } else if (action === 'start') {
      this.start.emit();
    } else {
      this.stop.emit();
    }
  }

  protected onFan1Input(event: Event): void {
    this.fan1Dragging = true;
    this.draftFan1Power = this.readSliderValue(event);
  }

  protected onFan2Input(event: Event): void {
    this.fan2Dragging = true;
    this.draftFan2Power = this.readSliderValue(event);
  }

  protected commitFan1(event: Event): void {
    this.draftFan1Power = this.readSliderValue(event);
    this.fan1Dragging = false;
    this.fan1PowerChanged.emit(this.draftFan1Power);
  }

  protected commitFan2(event: Event): void {
    this.draftFan2Power = this.readSliderValue(event);
    this.fan2Dragging = false;
    this.fan2PowerChanged.emit(this.draftFan2Power);
  }

  private readSliderValue(event: Event): number {
    const target = event.target as HTMLInputElement | null;
    return Number(target?.value ?? 0);
  }
}
