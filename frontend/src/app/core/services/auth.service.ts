import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { ConfigService } from './config.service';

export interface AuthStatus {
  HasAccount: boolean;
}

export interface AuthResponse {
  Success: boolean;
  Token?: string;
  Error?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenKey = 'rsh_token';
  private readonly kioskTokenKey = 'rsh_kiosk_token';

  constructor(
    private readonly http: HttpClient,
    private readonly configService: ConfigService,
  ) {}

  getStatus(): Observable<AuthStatus> {
    return this.http.get<AuthStatus>(`${this.configService.apiBaseUrl}/auth/status`);
  }

  login(username: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.configService.apiBaseUrl}/auth/login`, {
        Username: username,
        Password: password,
      })
      .pipe(tap((response) => this.storeToken(response)));
  }

  setup(username: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.configService.apiBaseUrl}/auth/setup`, {
        Username: username,
        Password: password,
      })
      .pipe(tap((response) => this.storeToken(response)));
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
  }

  isLoggedIn(): boolean {
    return this.isTokenValid(this.getToken());
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getKioskToken(): string | null {
    return sessionStorage.getItem(this.kioskTokenKey);
  }

  isKioskLoggedIn(): boolean {
    return this.isTokenValid(this.getKioskToken());
  }

  getRequestToken(): string | null {
    if (window.location.pathname.startsWith('/kiosk') && this.isKioskLoggedIn()) {
      return this.getKioskToken();
    }

    return this.getToken();
  }

  requestKioskAccess(): Observable<AuthResponse> {
    return this.http
      .get<AuthResponse>(`${this.configService.apiBaseUrl}/auth/kiosk`)
      .pipe(tap((response) => this.storeKioskToken(response)));
  }

  clearKioskToken(): void {
    sessionStorage.removeItem(this.kioskTokenKey);
  }

  private isTokenValid(token: string | null): boolean {
    if (!token) {
      return false;
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  private storeToken(response: AuthResponse): void {
    if (response.Success && response.Token) {
      localStorage.setItem(this.tokenKey, response.Token);
    }
  }

  private storeKioskToken(response: AuthResponse): void {
    if (response.Success && response.Token) {
      sessionStorage.setItem(this.kioskTokenKey, response.Token);
    }
  }
}
