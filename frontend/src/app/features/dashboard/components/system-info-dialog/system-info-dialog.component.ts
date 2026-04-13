import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { Color, LegendPosition, NgxChartsModule, ScaleType } from '@swimlane/ngx-charts';
import { ConfigService } from '../../../../core/services/config.service';

type SystemWindow = '1h' | '24h' | '7d';

interface SystemMetricSampleDto {
  Ts: number;
  CpuUsage: number;
  MemoryUsage: number;
  DiskUsage: number;
}

interface GraphPoint {
  name: string;
  value: number;
}

interface GraphSeries {
  name: string;
  series: GraphPoint[];
}

@Component({
  selector: 'app-system-info-dialog',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatDialogModule, NgxChartsModule],
  templateUrl: './system-info-dialog.component.html',
  styleUrl: './system-info-dialog.component.css',
})
export class SystemInfoDialogComponent implements OnInit {
  protected readonly legendPosition = LegendPosition.Below;
  protected readonly cpuScheme: Color = { name: 'cpu', selectable: true, group: ScaleType.Ordinal, domain: ['#ec4f83'] };
  protected readonly memoryScheme: Color = { name: 'memory', selectable: true, group: ScaleType.Ordinal, domain: ['#5f9cf3'] };
  protected readonly diskScheme: Color = { name: 'disk', selectable: true, group: ScaleType.Ordinal, domain: ['#22b573'] };
  protected readonly windowOptions: Array<{ value: SystemWindow; label: string }> = [
    { value: '1h', label: '1h' },
    { value: '24h', label: '24h' },
    { value: '7d', label: '7j' },
  ];

  selectedWindow: SystemWindow = '24h';
  loading = true;
  chartView: [number, number] = [760, 210];

  cpuSeries: GraphSeries[] = [];
  memorySeries: GraphSeries[] = [];
  diskSeries: GraphSeries[] = [];

  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(ConfigService).apiBaseUrl;

  ngOnInit(): void {
    this.updateChartView();
    this.load();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateChartView();
  }

  selectWindow(window: SystemWindow): void {
    if (this.selectedWindow === window) {
      return;
    }

    this.selectedWindow = window;
    this.load();
  }

  dateTickFormatting = (value: string): string => {
    const date = new Date(Number(value) * 1000);
    return new Intl.DateTimeFormat('fr-FR', this.selectedWindow === '1h'
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
  };

  private load(): void {
    this.loading = true;
    this.http.get<SystemMetricSampleDto[]>(`${this.apiBaseUrl}/systeminfo/${this.selectedWindow}`).subscribe({
      next: (response) => {
        const samples = response ?? [];
        this.cpuSeries = [this.toSeries('CPU', samples, sample => sample.CpuUsage)];
        this.memorySeries = [this.toSeries('RAM', samples, sample => sample.MemoryUsage)];
        this.diskSeries = [this.toSeries('Disk', samples, sample => sample.DiskUsage)];
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  private updateChartView(): void {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const mobile = viewportWidth < 768;
    const horizontalPadding = mobile ? 72 : 160;
    const width = Math.max(260, Math.min(viewportWidth - horizontalPadding, 820));
    const height = mobile ? 170 : 210;
    this.chartView = [width, height];
  }

  private toSeries(name: string, samples: SystemMetricSampleDto[], selector: (sample: SystemMetricSampleDto) => number): GraphSeries {
    return {
      name,
      series: samples.map((sample) => ({
        name: sample.Ts.toString(),
        value: Math.round(selector(sample) * 100) / 100,
      })),
    };
  }
}
