import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ConfigService } from '../../../../core/services/config.service';

@Component({
  selector: 'app-settings-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatButtonToggleModule, MatDialogModule, MatIconModule, MatInputModule],
  templateUrl: './settings-dialog.component.html',
  styleUrl: './settings-dialog.component.css',
})
export class SettingsDialogComponent implements OnInit {
  linkedMode = true;
  loading = true;
  saving = false;
  saveError = '';
  saveSuccess = '';
  display = {
    sensor1Name: 'Rack',
    sensor2Name: 'Ambient',
    fan1Name: 'Intake Fan',
    fan2Name: 'Exhaust Fan',
    temperatureUnit: 'C',
  };

  rules: TemperatureRule[] = [];
  originalRules: TemperatureRule[] = [];
  private settingsRow: SettingsRow | null = null;

  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(ConfigService).apiBaseUrl;

  ngOnInit(): void {
    this.load();
  }

  get temperatureInputMax(): number {
    return this.display.temperatureUnit === 'F' ? 212 : 100;
  }

  addRule(): void {
    const threshold = this.rules.length > 0 ? this.rules[this.rules.length - 1].threshold + 5 : 25;
    this.rules = [
      ...this.rules,
      {
        threshold,
        minTemp1: threshold,
        minTemp2: threshold,
        value1: this.linkedMode ? 30 : 15,
        value2: this.linkedMode ? 30 : 15,
      },
    ];
  }

  removeRule(index: number): void {
    this.rules = this.rules.filter((_, currentIndex) => currentIndex !== index);
  }

  onModeChanged(value: 'linked' | 'independent'): void {
    this.linkedMode = value === 'linked';
    this.rules = this.rules.map((rule) => {
      const threshold = rule.threshold ?? rule.minTemp1 ?? rule.minTemp2 ?? 25;
      return {
        ...rule,
        threshold,
        minTemp1: this.linkedMode ? threshold : rule.minTemp1 ?? threshold,
        minTemp2: this.linkedMode ? threshold : rule.minTemp2 ?? threshold,
      };
    });
  }

  reset(): void {
    this.rules = this.originalRules.map((rule) => ({ ...rule }));
    this.saveError = '';
    this.saveSuccess = '';
  }

  save(): void {
    this.saving = true;
    this.saveError = '';
    this.saveSuccess = '';

    const payload = this.rules
      .map((rule) => this.toCondition(rule))
      .sort((a, b) => Number(a.MinTemp1 ?? 0) - Number(b.MinTemp1 ?? 0));

    const settingsPayload = this.settingsRow
      ? {
          Auto: this.settingsRow.Auto,
          LinkedMode: this.linkedMode,
          Fan1Pwr: this.settingsRow.Fan1Pwr,
          Fan2Pwr: this.settingsRow.Fan2Pwr,
          Beep: this.settingsRow.Beep,
          SmtpEnable: this.settingsRow.SmtpEnable,
          Smtp_host: this.settingsRow.Smtp_host,
          SmtpPort: this.settingsRow.SmtpPort,
          SmtpSender: this.settingsRow.SmtpSender,
          SmtpLogin: this.settingsRow.SmtpLogin,
          SmtpSsl: this.settingsRow.SmtpSsl,
        }
      : null;

    this.http.post(`${this.apiBaseUrl}/conditions`, payload).subscribe({
      next: () => {
        if (!settingsPayload) {
          this.finishSave();
          return;
        }

        this.http.post(`${this.apiBaseUrl}/settings`, settingsPayload).subscribe({
          next: () => this.finishSave(),
          error: () => {
            this.saving = false;
            this.saveError = 'An error occurred while saving the settings.';
          },
        });
      },
      error: () => {
        this.saving = false;
        this.saveError = 'Unable to save temperature rules.';
      },
    });
  }

  trackRule(index: number): number {
    return index;
  }

  private load(): void {
    this.loading = true;
    this.http.get<ConfigResponse>(`${this.apiBaseUrl}/config`).subscribe({
      next: (response) => {
        if (!response?.Display) {
          return;
        }

        const previousTemperatureUnit = this.display.temperatureUnit;
        this.display = {
          sensor1Name: response.Display.Sensor1Name || this.display.sensor1Name,
          sensor2Name: response.Display.Sensor2Name || this.display.sensor2Name,
          fan1Name: response.Display.Fan1Name || this.display.fan1Name,
          fan2Name: response.Display.Fan2Name || this.display.fan2Name,
          temperatureUnit: response.Display.TemperatureUnit || this.display.temperatureUnit,
        };
        this.rebaseRulesForTemperatureUnit(previousTemperatureUnit, this.display.temperatureUnit);
      },
    });

    this.http.get<ApiListResponse<SettingsRow>>(`${this.apiBaseUrl}/settings`).subscribe({
      next: (settingsResponse) => {
        this.settingsRow = settingsResponse?.Data?.[0] ?? null;
        this.linkedMode = this.settingsRow?.LinkedMode ?? true;

        this.http.get<ApiListResponse<ConditionDto>>(`${this.apiBaseUrl}/conditions`).subscribe({
          next: (conditionsResponse) => {
            const conditions = conditionsResponse?.Data ?? [];
            this.rules = conditions.length > 0
              ? conditions
                .map((item) => this.toRule(item))
                .sort((left, right) => {
                  const first = this.linkedMode
                    ? left.threshold - right.threshold
                    : left.minTemp1 - right.minTemp1;

                  if (first !== 0) {
                    return first;
                  }

                  return this.linkedMode
                    ? 0
                    : left.minTemp2 - right.minTemp2;
                })
              : this.defaultRules();
            this.originalRules = this.rules.map((rule) => ({ ...rule }));
            this.loading = false;
          },
          error: () => {
            this.rules = this.defaultRules();
            this.originalRules = this.rules.map((rule) => ({ ...rule }));
            this.loading = false;
          },
        });
      },
      error: () => {
        this.linkedMode = true;
        this.rules = this.defaultRules();
        this.originalRules = this.rules.map((rule) => ({ ...rule }));
        this.loading = false;
      },
    });
  }

  private finishSave(): void {
    this.saving = false;
    this.saveSuccess = 'Rules saved.';
    this.originalRules = this.rules.map((rule) => ({ ...rule }));
  }

  private toRule(item: ConditionDto): TemperatureRule {
    const threshold = this.fromCelsius(Number(item.MinTemp1 ?? item.MinTemp2 ?? 25));
    return {
      threshold,
      minTemp1: this.fromCelsius(Number(item.MinTemp1 ?? item.MinTemp2 ?? 25)),
      minTemp2: this.fromCelsius(Number(item.MinTemp2 ?? item.MinTemp1 ?? 25)),
      value1: Number(item.Value1 ?? 0),
      value2: Number(item.Value2 ?? 0),
    };
  }

  private toCondition(rule: TemperatureRule): ConditionDto {
    if (this.linkedMode) {
      return {
        MinTemp1: this.toCelsius(rule.threshold),
        MinTemp2: this.toCelsius(rule.threshold),
        Value1: Math.round(rule.value1),
        Value2: Math.round(rule.value2),
      };
    }

    return {
      MinTemp1: this.toCelsius(rule.minTemp1),
      MinTemp2: this.toCelsius(rule.minTemp2),
      Value1: Math.round(rule.value1),
      Value2: Math.round(rule.value2),
    };
  }

  private defaultRules(): TemperatureRule[] {
    return [
      { threshold: 25, minTemp1: 25, minTemp2: 25, value1: 15, value2: 15 },
      { threshold: 27, minTemp1: 27, minTemp2: 27, value1: 20, value2: 20 },
      { threshold: 29, minTemp1: 29, minTemp2: 29, value1: 25, value2: 25 },
      { threshold: 31, minTemp1: 31, minTemp2: 31, value1: 35, value2: 35 },
      { threshold: 33, minTemp1: 33, minTemp2: 33, value1: 45, value2: 45 },
      { threshold: 35, minTemp1: 35, minTemp2: 35, value1: 55, value2: 55 },
      { threshold: 37, minTemp1: 37, minTemp2: 37, value1: 65, value2: 65 },
      { threshold: 39, minTemp1: 39, minTemp2: 39, value1: 75, value2: 75 },
      { threshold: 41, minTemp1: 41, minTemp2: 41, value1: 85, value2: 85 },
      { threshold: 43, minTemp1: 43, minTemp2: 43, value1: 92, value2: 92 },
      { threshold: 45, minTemp1: 45, minTemp2: 45, value1: 100, value2: 100 },
    ];
  }

  private rebaseRulesForTemperatureUnit(previousUnit: string, nextUnit: string): void {
    if (previousUnit === nextUnit) {
      return;
    }

    this.rules = this.rules.map((rule) => this.convertRuleBetweenUnits(rule, previousUnit, nextUnit));
    this.originalRules = this.originalRules.map((rule) => this.convertRuleBetweenUnits(rule, previousUnit, nextUnit));
  }

  private convertRuleBetweenUnits(rule: TemperatureRule, fromUnit: string, toUnit: string): TemperatureRule {
    return {
      ...rule,
      threshold: this.convertTemperature(rule.threshold, fromUnit, toUnit),
      minTemp1: this.convertTemperature(rule.minTemp1, fromUnit, toUnit),
      minTemp2: this.convertTemperature(rule.minTemp2, fromUnit, toUnit),
    };
  }

  private fromCelsius(value: number): number {
    return this.display.temperatureUnit === 'F' ? (value * 9) / 5 + 32 : value;
  }

  private toCelsius(value: number): number {
    const converted = this.display.temperatureUnit === 'F' ? ((value - 32) * 5) / 9 : value;
    return Math.round(converted * 10000) / 10000;
  }

  private convertTemperature(value: number, fromUnit: string, toUnit: string): number {
    if (fromUnit === toUnit) {
      return value;
    }

    if (fromUnit === 'F' && toUnit === 'C') {
      return Math.round((((value - 32) * 5) / 9) * 10000) / 10000;
    }

    if (fromUnit === 'C' && toUnit === 'F') {
      return Math.round((((value * 9) / 5) + 32) * 10000) / 10000;
    }

    return value;
  }
}

interface ApiListResponse<T> {
  Success: boolean;
  Data: T[];
}

interface ConfigResponse {
  Display?: {
    Sensor1Name?: string;
    Sensor2Name?: string;
    Fan1Name?: string;
    Fan2Name?: string;
    TemperatureUnit?: string;
  };
}

interface SettingsRow {
  Auto: boolean;
  LinkedMode?: boolean;
  Fan1Pwr: number;
  Fan2Pwr: number;
  Beep: boolean;
  SmtpEnable: boolean;
  Smtp_host?: string;
  SmtpPort?: string;
  SmtpSender?: string;
  SmtpLogin?: string;
  SmtpSsl?: boolean;
}

interface ConditionDto {
  MinTemp1?: number;
  MinTemp2?: number;
  Value1: number;
  Value2: number;
}

interface TemperatureRule {
  threshold: number;
  minTemp1: number;
  minTemp2: number;
  value1: number;
  value2: number;
}
