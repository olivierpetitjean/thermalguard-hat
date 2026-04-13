import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, Input, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MAT_DATE_FORMATS, MAT_DATE_LOCALE, MatNativeDateModule } from '@angular/material/core';
import { LegendPosition, NgxChartsModule } from '@swimlane/ngx-charts';
import { ConfigService } from '../../../../core/services/config.service';

type GraphMode = 'daily' | 'hourly' | 'period';

interface ApiStat {
  Ts: number;
  Name: string;
  Value: number;
  MinValue: number;
  MaxValue: number;
}

interface GraphPoint {
  name: string;
  value: number;
  min: number;
  max: number;
}

interface GraphSeries {
  name: string;
  series: GraphPoint[];
}

interface GraphBoundary {
  yAxisTicks: number[];
  yScaleMin: number;
  yScaleMax: number;
}

interface HourOption {
  value: string;
  text: string;
  disabled: boolean;
}

const GRAPH_DATE_FORMATS = {
  parse: {
    dateInput: { day: '2-digit', month: '2-digit', year: 'numeric' },
  },
  display: {
    dateInput: { day: '2-digit', month: '2-digit', year: 'numeric' },
    monthYearLabel: { month: 'short', year: 'numeric' },
    dateA11yLabel: { day: '2-digit', month: '2-digit', year: 'numeric' },
    monthYearA11yLabel: { month: 'long', year: 'numeric' },
  },
};

@Component({
  selector: 'app-graphs-section',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    MatSelectModule,
    MatNativeDateModule,
    NgxChartsModule,
  ],
  providers: [
    { provide: MAT_DATE_LOCALE, useValue: 'fr-FR' },
    { provide: MAT_DATE_FORMATS, useValue: GRAPH_DATE_FORMATS },
  ],
  templateUrl: './graphs-section.component.html',
  styleUrl: './graphs-section.component.css',
})
export class GraphsSectionComponent implements OnInit {
  @Input() sensor1Name = 'Rack';
  @Input() sensor2Name = 'Ambient';
  @Input() fan1Name = 'Intake Fan';
  @Input() fan2Name = 'Exhaust Fan';
  @Input() locale = 'fr-FR';
  @Input() temperatureUnit = 'C';

  mode: GraphMode = 'daily';
  loading = true;
  protected readonly legendPosition = LegendPosition.Below;

  range = new FormGroup({
    start: new FormControl<Date>(this.addDays(new Date(), -7), { nonNullable: true }),
    end: new FormControl<Date>(new Date(), { nonNullable: true }),
  });

  selectedDate = new Date();
  selectedHour = '0';
  maxDate = this.endOfDay(new Date());

  hours: HourOption[] = Array.from({ length: 24 }, (_, index) => ({
    value: index.toString(),
    text: `${index.toString().padStart(2, '0')}:00`,
    disabled: false,
  }));

  graphData = new Map<string, GraphSeries[]>([
    ['sensor', []],
    ['power', []],
    ['rpm', []],
    ['humidity', []],
  ]);

  graphBoundaries = new Map<string, GraphBoundary>([
    ['sensor', { yAxisTicks: [0, 10, 20, 30, 40, 50], yScaleMin: 0, yScaleMax: 50 }],
    ['power', { yAxisTicks: [0, 20, 40, 60, 80, 100], yScaleMin: 0, yScaleMax: 100 }],
    ['rpm', { yAxisTicks: [0, 500, 1000, 1500, 2000, 2500, 3000], yScaleMin: 0, yScaleMax: 3000 }],
    ['humidity', { yAxisTicks: [0, 20, 40, 60, 80, 100], yScaleMin: 0, yScaleMax: 100 }],
  ]);

  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(ConfigService).apiBaseUrl;

  ngOnInit(): void {
    this.onSelectDateChange();
    this.updateGraph();
  }

  onModeChange(mode: any): void {
    this.mode = mode as GraphMode;
    this.onSelectDateChange();
    this.updateGraph();
  }

  onSelectedDateModelChange(date: any): void {
    this.selectedDate = date instanceof Date ? date : new Date(date);
    this.onSelectDateChange();
  }

  onRangeDateChanged(): void {
    this.updateGraph();
  }

  onSelectDateChange(): void {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const selected = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), this.selectedDate.getDate()).getTime();

    if (today === selected) {
      const hour = now.getHours();
      this.hours = this.hours.map((item) => ({ ...item, disabled: hour < Number(item.value) }));
    } else {
      this.hours = this.hours.map((item) => ({ ...item, disabled: false }));
    }

    if (this.mode !== 'daily') {
      this.updateGraph();
    }
  }

  onHourChange(hour: any): void {
    this.selectedHour = String(hour);
    this.updateGraph();
  }

  onChartSelect(event: { name?: string }): void {
    if (!event?.name) {
      return;
    }

    const selected = new Date(Number(event.name) * 1000);

    if (this.mode === 'daily') {
      this.mode = 'hourly';
      this.selectedDate = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
      this.onSelectDateChange();
      return;
    }

    if (this.mode === 'hourly') {
      this.mode = 'period';
      this.selectedHour = selected.getHours().toString();
      this.selectedDate = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
      this.onSelectDateChange();
    }
  }

  dateTickFormatting = (value: string): string => {
    const date = new Date(Number(value) * 1000);

    if (this.mode === 'daily') {
      return new Intl.DateTimeFormat(this.locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
    }

    return new Intl.DateTimeFormat(this.locale, { hour: '2-digit', minute: '2-digit' }).format(date);
  };

  private updateGraph(): void {
    this.loading = true;

    const { from, to } = this.resolveWindow();
    const items = ['Sensor1', 'Sensor2', 'Fan1 PWR', 'Fan2 PWR', 'Fan1 RPM', 'Fan2 RPM', 'Current', 'System Temp.', 'Humidity'].join(',');
    const url = `${this.apiBaseUrl}/graph/${this.mode}/${items}/${this.toUnix(from)}/${this.toUnix(to)}`;

    this.http.get<ApiStat[]>(url).subscribe({
      next: (response) => {
        this.fillGraph(response ?? []);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  private fillGraph(data: ApiStat[]): void {
    this.graphData.set('sensor', this.mapStatData(data.filter((item) => item.Name.startsWith('Sensor') || item.Name === 'System Temp.'), true));
    this.graphData.set('power', this.mapStatData(data.filter((item) => item.Name.endsWith('PWR'))));
    this.graphData.set('rpm', this.mapStatData(data.filter((item) => item.Name.endsWith('RPM') || item.Name.endsWith('RMP'))));
    this.graphData.set('humidity', this.mapStatData(data.filter((item) => item.Name.includes('Humidity'))));

    this.graphData.forEach((value, key) => {
      if (!value.length) {
        return;
      }

      this.graphBoundaries.set(key, this.calculateGraphBoundary(value));
    });
  }

  private mapStatData(source: ApiStat[], isTemperature = false): GraphSeries[] {
    const grouped = source.reduce<Record<string, ApiStat[]>>((accumulator, item) => {
      if (!accumulator[item.Name]) {
        accumulator[item.Name] = [];
      }

      accumulator[item.Name].push(item);
      return accumulator;
    }, {});

    return Object.entries(grouped).map(([name, items]) => ({
      name: this.getDisplayName(name),
      series: items.map((item) => ({
        name: item.Ts.toString(),
        value: this.roundValue(this.convertTemperatureIfNeeded(item.Value, isTemperature)),
        min: this.roundValue(this.convertTemperatureIfNeeded(item.MinValue, isTemperature)),
        max: this.roundValue(this.convertTemperatureIfNeeded(item.MaxValue, isTemperature)),
      })),
    }));
  }

  private getDisplayName(name: string): string {
    switch (name) {
      case 'Sensor1':
        return this.sensor1Name;
      case 'Sensor2':
        return this.sensor2Name;
      case 'Fan1 PWR':
      case 'Fan1 RPM':
        return this.fan1Name;
      case 'Fan2 PWR':
      case 'Fan2 RPM':
      case 'Fan2 RMP':
        return this.fan2Name;
      case 'System Temp.':
        return 'System';
      case 'Humidity':
        return 'Humidity';
      default:
        return name;
    }
  }

  private convertTemperatureIfNeeded(value: number, isTemperature: boolean): number {
    if (!isTemperature || this.temperatureUnit !== 'F') {
      return value;
    }

    return (value * 9) / 5 + 32;
  }

  private roundValue(value: number): number {
    return Math.round(value * 10000) / 10000;
  }

  private calculateGraphBoundary(data: GraphSeries[], offset = 1, tickCount = 10): GraphBoundary {
    let max = Math.max(...data.map((item) => Math.max(...item.series.map((series) => series.max)))) + offset;
    let min = Math.min(...data.map((item) => Math.min(...item.series.map((series) => series.min)))) - offset;

    if (min < 0) {
      min = 0;
    }

    const diff = max - min;
    const step = diff / tickCount;
    const ticks: number[] = [];

    for (let index = 0; index < tickCount + 1; index += 1) {
      ticks.push(min + step * index);
    }

    return {
      yScaleMin: min,
      yScaleMax: max,
      yAxisTicks: ticks,
    };
  }

  private resolveWindow(): { from: Date; to: Date } {
    if (this.mode === 'daily') {
      const from = this.startOfDay(this.range.controls.start.getRawValue());
      const to = this.endOfDay(this.range.controls.end.getRawValue());
      return { from, to };
    }

    if (this.mode === 'hourly') {
      const from = this.startOfDay(this.selectedDate);
      const to = this.addDays(from, 1);
      return { from, to };
    }

    const from = new Date(this.selectedDate);
    from.setHours(Number(this.selectedHour), 0, 0, 0);
    const to = new Date(from);
    to.setHours(to.getHours() + 1);
    return { from, to };
  }

  private startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private endOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private toUnix(date: Date): number {
    return Math.floor(date.getTime() / 1000);
  }
}
