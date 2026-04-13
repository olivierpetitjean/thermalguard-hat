import { HttpErrorResponse, HttpHandlerFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  const navigate = vi.fn();
  const logout = vi.fn();
  const clearKioskToken = vi.fn();
  const getRequestToken = vi.fn();

  beforeEach(() => {
    navigate.mockReset();
    logout.mockReset();
    clearKioskToken.mockReset();
    getRequestToken.mockReset();
    window.history.replaceState({}, '', '/');

    TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: {
            navigate,
          },
        },
        {
          provide: AuthService,
          useValue: {
            getRequestToken,
            logout,
            clearKioskToken,
          },
        },
      ],
    });
  });

  it('adds the Authorization header when a token is available', async () => {
    getRequestToken.mockReturnValue('jwt-token');
    let capturedRequest: HttpRequest<unknown> | undefined;

    const request = new HttpRequest('GET', '/api/settings');
    const next: HttpHandlerFn = (outgoingRequest) => {
      capturedRequest = outgoingRequest;
      return of(new HttpResponse({ status: 200 }));
    };

    await TestBed.runInInjectionContext(async () => {
      await new Promise<void>((resolve, reject) => {
        authInterceptor(request, next).subscribe({
          next: () => resolve(),
          error: reject,
        });
      });
    });

    expect(capturedRequest?.headers.get('Authorization')).toBe('Bearer jwt-token');
  });

  it('leaves auth endpoints untouched when a 401 occurs', async () => {
    getRequestToken.mockReturnValue('jwt-token');
    const request = new HttpRequest('GET', '/api/auth/status');
    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 401 }));

    await expect(TestBed.runInInjectionContext(() => new Promise<void>((resolve, reject) => {
      authInterceptor(request, next).subscribe({
        next: () => resolve(),
        error: () => reject(new Error('401 propagated')),
      });
    }))).rejects.toThrow('401 propagated');

    expect(logout).not.toHaveBeenCalled();
    expect(clearKioskToken).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('logs out and redirects to /login on regular routes after a 401', async () => {
    getRequestToken.mockReturnValue('jwt-token');
    window.history.replaceState({}, '', '/');

    const request = new HttpRequest('GET', '/api/settings');
    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 401 }));

    await expect(TestBed.runInInjectionContext(() => new Promise<void>((resolve, reject) => {
      authInterceptor(request, next).subscribe({
        next: () => resolve(),
        error: () => reject(new Error('401 propagated')),
      });
    }))).rejects.toThrow('401 propagated');

    expect(logout).toHaveBeenCalledOnce();
    expect(clearKioskToken).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('clears the kiosk token and redirects to /login on kiosk routes after a 401', async () => {
    getRequestToken.mockReturnValue('jwt-token');
    window.history.replaceState({}, '', '/kiosk');

    const request = new HttpRequest('GET', '/api/settings');
    const next: HttpHandlerFn = () => throwError(() => new HttpErrorResponse({ status: 401 }));

    await expect(TestBed.runInInjectionContext(() => new Promise<void>((resolve, reject) => {
      authInterceptor(request, next).subscribe({
        next: () => resolve(),
        error: () => reject(new Error('401 propagated')),
      });
    }))).rejects.toThrow('401 propagated');

    expect(clearKioskToken).toHaveBeenCalledOnce();
    expect(logout).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});
