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

type ControlMode = 'linked_fans' | 'independent' | 'differential';
type LinkedSensor = 'sensor1' | 'sensor2';
type DifferentialMode = 'sensor1_minus_sensor2' | 'sensor2_minus_sensor1';

@Component({
  selector: 'app-settings-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatButtonToggleModule, MatDialogModule, MatIconModule, MatInputModule],
  templateUrl: './settings-dialog.component.html',
  styleUrl: './settings-dialog.component.css',
})
export class SettingsDialogComponent implements OnInit {
  controlMode: ControlMode = 'linked_fans';
  linkedSensor: LinkedSensor = 'sensor1';
  differentialMode: DifferentialMode = 'sensor1_minus_sensor2';
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
  private originalControlMode: ControlMode = 'linked_fans';
  private originalLinkedSensor: LinkedSensor = 'sensor1';
  private originalDifferentialMode: DifferentialMode = 'sensor1_minus_sensor2';
  private settingsRow: SettingsRow | null = null;

  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(ConfigService).apiBaseUrl;

  ngOnInit(): void {
    this.load();
  }

  get temperatureInputMax(): number {
    return this.display.temperatureUnit === 'F' ? 212 : 100;
  }

  get isLinkedFansMode(): boolean {
    return this.controlMode === 'linked_fans';
  }

  get isIndependentMode(): boolean {
    return this.controlMode === 'independent';
  }

  get isDifferentialMode(): boolean {
    return this.controlMode === 'differential';
  }

  get selectedLinkedSensorName(): string {
    return this.linkedSensor === 'sensor2' ? this.display.sensor2Name : this.display.sensor1Name;
  }

  get differentialExpression(): string {
    return this.differentialMode === 'sensor2_minus_sensor1'
      ? `${this.display.sensor2Name} - ${this.display.sensor1Name}`
      : `${this.display.sensor1Name} - ${this.display.sensor2Name}`;
  }

  get modeHelpIcon(): string {
    switch (this.controlMode) {
      case 'independent':
        return 'tune';
      case 'differential':
        return 'compare_arrows';
      default:
        return 'hub';
    }
  }

  get modeHelpText(): string {
    switch (this.controlMode) {
      case 'independent':
        return 'Each sensor drives its matching fan with its own thresholds and fan outputs.';
      case 'differential':
        return `Both fans follow one shared curve driven by the temperature delta ${this.differentialExpression}.`;
      default:
        return `Both fans follow one shared curve driven by ${this.selectedLinkedSensorName}.`;
    }
  }

  addRule(): void {
    const threshold = this.nextThreshold();
    const sharedValue = this.isDifferentialMode ? 25 : 30;

    this.rules = [
      ...this.rules,
      this.isIndependentMode
        ? {
            threshold,
            minTemp1: threshold,
            minTemp2: threshold,
            value1: 15,
            value2: 15,
          }
        : {
            threshold,
            minTemp1: threshold,
            minTemp2: threshold,
            value1: sharedValue,
            value2: sharedValue,
          },
    ];
  }

  removeRule(index: number): void {
    this.rules = this.rules.filter((_, currentIndex) => currentIndex !== index);
  }

  onModeChanged(value: ControlMode): void {
    this.controlMode = value;
    this.rules = this.rules.map((rule) => this.rebaseRuleForMode(rule, value));
  }

  reset(): void {
    this.controlMode = this.originalControlMode;
    this.linkedSensor = this.originalLinkedSensor;
    this.differentialMode = this.originalDifferentialMode;
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
      .sort((a, b) => {
        const first = Number(a.MinTemp1 ?? 0) - Number(b.MinTemp1 ?? 0);
        if (first !== 0) {
          return first;
        }

        return Number(a.MinTemp2 ?? 0) - Number(b.MinTemp2 ?? 0);
      });

    const settingsPayload = this.settingsRow
      ? {
          Auto: this.settingsRow.Auto,
          LinkedMode: this.controlMode !== 'independent',
          ControlMode: this.controlMode,
          LinkedSensor: this.linkedSensor,
          DifferentialMode: this.differentialMode,
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
        this.controlMode = this.normalizeControlMode(this.settingsRow);
        this.linkedSensor = this.normalizeLinkedSensor(this.settingsRow);
        this.differentialMode = this.normalizeDifferentialMode(this.settingsRow);

        this.http.get<ApiListResponse<ConditionDto>>(`${this.apiBaseUrl}/conditions`).subscribe({
          next: (conditionsResponse) => {
            const conditions = conditionsResponse?.Data ?? [];
            this.rules = conditions.length > 0
              ? this.sortRules(conditions.map((item) => this.toRule(item)))
              : this.defaultRules();
            this.captureOriginalState();
            this.loading = false;
          },
          error: () => {
            this.rules = this.defaultRules();
            this.captureOriginalState();
            this.loading = false;
          },
        });
      },
      error: () => {
        this.controlMode = 'linked_fans';
        this.linkedSensor = 'sensor1';
        this.differentialMode = 'sensor1_minus_sensor2';
        this.rules = this.defaultRules();
        this.captureOriginalState();
        this.loading = false;
      },
    });
  }

  private finishSave(): void {
    this.saving = false;
    this.saveSuccess = 'Rules saved.';
    this.captureOriginalState();
  }

  private captureOriginalState(): void {
    this.originalControlMode = this.controlMode;
    this.originalLinkedSensor = this.linkedSensor;
    this.originalDifferentialMode = this.differentialMode;
    this.originalRules = this.rules.map((rule) => ({ ...rule }));
  }

  private normalizeControlMode(settingsRow: SettingsRow | null): ControlMode {
    switch (settingsRow?.ControlMode) {
      case 'independent':
      case 'differential':
      case 'linked_fans':
        return settingsRow.ControlMode;
      default:
        return settingsRow?.LinkedMode === false ? 'independent' : 'linked_fans';
    }
  }

  private normalizeLinkedSensor(settingsRow: SettingsRow | null): LinkedSensor {
    return settingsRow?.LinkedSensor === 'sensor2' ? 'sensor2' : 'sensor1';
  }

  private normalizeDifferentialMode(settingsRow: SettingsRow | null): DifferentialMode {
    return settingsRow?.DifferentialMode === 'sensor2_minus_sensor1'
      ? 'sensor2_minus_sensor1'
      : 'sensor1_minus_sensor2';
  }

  private toRule(item: ConditionDto): TemperatureRule {
    const minTemp1 = this.fromCelsius(Number(item.MinTemp1 ?? item.MinTemp2 ?? 25));
    const minTemp2 = this.fromCelsius(Number(item.MinTemp2 ?? item.MinTemp1 ?? 25));

    return {
      threshold: this.ruleThresholdFromValues(minTemp1, minTemp2),
      minTemp1,
      minTemp2,
      value1: Number(item.Value1 ?? 0),
      value2: Number(item.Value2 ?? 0),
    };
  }

  private toCondition(rule: TemperatureRule): ConditionDto {
    if (this.isIndependentMode) {
      return {
        MinTemp1: this.toCelsius(rule.minTemp1),
        MinTemp2: this.toCelsius(rule.minTemp2),
        Value1: Math.round(rule.value1),
        Value2: Math.round(rule.value2),
      };
    }

    const threshold = this.toCelsius(rule.threshold);
    const value = Math.round(rule.value1);

    return {
      MinTemp1: threshold,
      MinTemp2: threshold,
      Value1: value,
      Value2: value,
    };
  }

  private defaultRules(): TemperatureRule[] {
    if (this.isDifferentialMode) {
      return [
        { threshold: 2, minTemp1: 2, minTemp2: 2, value1: 20, value2: 20 },
        { threshold: 4, minTemp1: 4, minTemp2: 4, value1: 30, value2: 30 },
        { threshold: 6, minTemp1: 6, minTemp2: 6, value1: 45, value2: 45 },
        { threshold: 8, minTemp1: 8, minTemp2: 8, value1: 60, value2: 60 },
        { threshold: 10, minTemp1: 10, minTemp2: 10, value1: 75, value2: 75 },
        { threshold: 12, minTemp1: 12, minTemp2: 12, value1: 90, value2: 90 },
      ];
    }

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

  private sortRules(rules: TemperatureRule[]): TemperatureRule[] {
    return [...rules].sort((left, right) => {
      if (this.isIndependentMode) {
        const first = left.minTemp1 - right.minTemp1;
        if (first !== 0) {
          return first;
        }

        return left.minTemp2 - right.minTemp2;
      }

      return left.threshold - right.threshold;
    });
  }

  private nextThreshold(): number {
    if (this.rules.length === 0) {
      return this.isDifferentialMode ? 2 : 25;
    }

    const lastRule = this.rules[this.rules.length - 1];
    if (this.isIndependentMode) {
      return Math.max(lastRule.minTemp1, lastRule.minTemp2) + 5;
    }

    return lastRule.threshold + (this.isDifferentialMode ? 2 : 5);
  }

  private rebaseRuleForMode(rule: TemperatureRule, nextMode: ControlMode): TemperatureRule {
    if (nextMode === 'independent') {
      const threshold = rule.threshold ?? rule.minTemp1 ?? rule.minTemp2 ?? 25;
      return {
        ...rule,
        threshold,
        minTemp1: rule.minTemp1 ?? threshold,
        minTemp2: rule.minTemp2 ?? threshold,
      };
    }

    const threshold = nextMode === 'differential'
      ? this.differentialThresholdFromRule(rule)
      : this.linkedThresholdFromRule(rule);
    const sharedValue = Math.max(rule.value1, rule.value2);

    return {
      threshold,
      minTemp1: threshold,
      minTemp2: threshold,
      value1: sharedValue,
      value2: sharedValue,
    };
  }

  private linkedThresholdFromRule(rule: TemperatureRule): number {
    if (this.linkedSensor === 'sensor2') {
      return rule.minTemp2 ?? rule.threshold ?? 25;
    }

    return rule.minTemp1 ?? rule.threshold ?? 25;
  }

  private differentialThresholdFromRule(rule: TemperatureRule): number {
    if (typeof rule.threshold === 'number' && Number.isFinite(rule.threshold)) {
      return rule.threshold;
    }

    const first = rule.minTemp1 ?? 0;
    const second = rule.minTemp2 ?? 0;
    const delta = this.differentialMode === 'sensor2_minus_sensor1' ? second - first : first - second;
    return Math.max(delta, 0);
  }

  private ruleThresholdFromValues(minTemp1: number, minTemp2: number): number {
    if (this.isDifferentialMode) {
      return minTemp1;
    }

    if (this.isLinkedFansMode && this.linkedSensor === 'sensor2') {
      return minTemp2;
    }

    return minTemp1;
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
  ControlMode?: ControlMode;
  LinkedSensor?: LinkedSensor;
  DifferentialMode?: DifferentialMode;
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
