import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'rsh-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<ThemeMode>('dark');

  private readonly document = inject(DOCUMENT);

  initialize(): void {
    const stored = localStorage.getItem(STORAGE_KEY);
    const theme: ThemeMode = stored === 'light' ? 'light' : 'dark';
    this.applyTheme(theme);
  }

  toggleTheme(): void {
    this.applyTheme(this.theme() === 'dark' ? 'light' : 'dark');
  }

  private applyTheme(theme: ThemeMode): void {
    this.theme.set(theme);
    this.document.body.classList.toggle('theme-light', theme === 'light');
    this.document.body.classList.toggle('theme-dark', theme === 'dark');
    localStorage.setItem(STORAGE_KEY, theme);
  }
}
