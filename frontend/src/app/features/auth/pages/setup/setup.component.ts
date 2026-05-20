import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ConfigService } from '../../../../core/services/config.service';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './setup.component.html',
  styleUrl: './setup.component.css',
})
export class SetupComponent {
  username = '';
  password = '';
  confirm = '';
  disableFanAlerts = false;
  error = '';
  loading = false;

  private readonly authService = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(ConfigService).apiBaseUrl;
  private readonly router = inject(Router);

  submit(): void {
    if (this.password !== this.confirm) {
      this.error = 'Passwords do not match.';
      return;
    }

    this.error = '';
    this.loading = true;

    this.authService.setup(this.username, this.password).subscribe({
      next: (response) => {
        if (response.Success) {
          this.persistInitialSettings();
          return;
        }
        this.loading = false;
        this.error = response.Error ?? 'Unable to create account.';
      },
      error: () => {
        this.loading = false;
        this.error = 'Unable to create account.';
      },
    });
  }

  private persistInitialSettings(): void {
    this.http.get<ApiListResponse<SettingsRow>>(`${this.apiBaseUrl}/settings`).subscribe({
      next: (settingsResponse) => {
        const settings = settingsResponse?.Data?.[0];
        if (!settings) {
          this.finishSetup();
          return;
        }

        this.http.post(`${this.apiBaseUrl}/settings`, {
          ...settings,
          DisableFanAlerts: this.disableFanAlerts,
        }).subscribe({
          next: () => this.finishSetup(),
          error: () => this.finishSetup(),
        });
      },
      error: () => this.finishSetup(),
    });
  }

  private finishSetup(): void {
    this.loading = false;
    void this.router.navigate(['/']);
  }
}

interface ApiListResponse<T> {
  Success: boolean;
  Data: T[];
}

interface SettingsRow {
  Auto: boolean;
  LinkedMode?: boolean;
  ControlMode?: string;
  LinkedSensor?: string;
  DifferentialMode?: string;
  Fan1Pwr: number;
  Fan2Pwr: number;
  Beep: boolean;
  DisableFanAlerts?: boolean;
  SmtpEnable: boolean;
  Smtp_host?: string;
  SmtpPort?: string;
  SmtpSender?: string;
  SmtpLogin?: string;
  SmtpSsl?: boolean;
}
