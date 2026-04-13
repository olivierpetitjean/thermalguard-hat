import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { ConfigService } from './config.service';

function createJwt(expiresAtMs: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ exp: Math.floor(expiresAtMs / 1000) }));
  return `${header}.${payload}.signature`;
}

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ConfigService,
          useValue: {
            apiBaseUrl: 'http://thermalguard.local/api',
          },
        },
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('stores the JWT in localStorage after a successful login', () => {
    const token = createJwt(Date.now() + 60_000);

    service.login('admin', 'secret').subscribe((response) => {
      expect(response.Success).toBe(true);
    });

    const request = httpMock.expectOne('http://thermalguard.local/api/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      Username: 'admin',
      Password: 'secret',
    });

    request.flush({ Success: true, Token: token });

    expect(localStorage.getItem('rsh_token')).toBe(token);
  });

  it('does not store a token when login fails', () => {
    service.login('admin', 'wrong').subscribe((response) => {
      expect(response.Success).toBe(false);
    });

    const request = httpMock.expectOne('http://thermalguard.local/api/auth/login');
    request.flush({ Success: false, Error: 'Invalid credentials.' });

    expect(localStorage.getItem('rsh_token')).toBeNull();
  });

  it('reports logged-in when the stored token is still valid', () => {
    localStorage.setItem('rsh_token', createJwt(Date.now() + 60_000));

    expect(service.isLoggedIn()).toBe(true);
  });

  it('reports logged-out when the stored token is expired or malformed', () => {
    localStorage.setItem('rsh_token', createJwt(Date.now() - 60_000));
    expect(service.isLoggedIn()).toBe(false);

    localStorage.setItem('rsh_token', 'not-a-jwt');
    expect(service.isLoggedIn()).toBe(false);
  });

  it('prefers the kiosk token on kiosk routes when it is valid', () => {
    localStorage.setItem('rsh_token', createJwt(Date.now() + 60_000));
    sessionStorage.setItem('rsh_kiosk_token', createJwt(Date.now() + 120_000));
    window.history.replaceState({}, '', '/kiosk');

    expect(service.getRequestToken()).toBe(sessionStorage.getItem('rsh_kiosk_token'));
  });

  it('falls back to the regular token outside kiosk routes', () => {
    const regularToken = createJwt(Date.now() + 60_000);

    localStorage.setItem('rsh_token', regularToken);
    sessionStorage.setItem('rsh_kiosk_token', createJwt(Date.now() + 120_000));
    window.history.replaceState({}, '', '/');

    expect(service.getRequestToken()).toBe(regularToken);
  });

  it('stores the kiosk token in sessionStorage after a successful kiosk access request', () => {
    const token = createJwt(Date.now() + 60_000);

    service.requestKioskAccess().subscribe((response) => {
      expect(response.Success).toBe(true);
    });

    const request = httpMock.expectOne('http://thermalguard.local/api/auth/kiosk');
    expect(request.request.method).toBe('GET');
    request.flush({ Success: true, Token: token });

    expect(sessionStorage.getItem('rsh_kiosk_token')).toBe(token);
  });
});
