import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let documentRef: Document;

  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';

    TestBed.configureTestingModule({
      providers: [ThemeService],
    });

    service = TestBed.inject(ThemeService);
    documentRef = TestBed.inject(DOCUMENT);
  });

  afterEach(() => {
    localStorage.clear();
    documentRef.body.className = '';
  });

  it('initializes the light theme from localStorage', () => {
    localStorage.setItem('rsh-theme', 'light');

    service.initialize();

    expect(service.theme()).toBe('light');
    expect(documentRef.body.classList.contains('theme-light')).toBe(true);
    expect(documentRef.body.classList.contains('theme-dark')).toBe(false);
  });

  it('defaults to the dark theme when nothing is stored', () => {
    service.initialize();

    expect(service.theme()).toBe('dark');
    expect(documentRef.body.classList.contains('theme-dark')).toBe(true);
    expect(localStorage.getItem('rsh-theme')).toBe('dark');
  });

  it('toggles the theme and persists the new value', () => {
    service.initialize();

    service.toggleTheme();

    expect(service.theme()).toBe('light');
    expect(documentRef.body.classList.contains('theme-light')).toBe(true);
    expect(localStorage.getItem('rsh-theme')).toBe('light');
  });
});
