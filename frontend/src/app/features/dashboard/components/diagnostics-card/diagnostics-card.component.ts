import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-diagnostics-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './diagnostics-card.component.html',
  styleUrl: './diagnostics-card.component.css',
})
export class DiagnosticsCardComponent {
  @Input({ required: true }) apiBaseUrl = '';
  @Input({ required: true }) mqttUrl = '';
  @Input({ required: true }) hasAccount: boolean | null = null;
}
