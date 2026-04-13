import { UrlTree, provideRouter, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { kioskGuard } from './kiosk.guard';

describe('kioskGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isLoggedIn: () => false,
            isKioskLoggedIn: () => false,
            requestKioskAccess: () => of({ Success: true, Token: 'token' }),
          },
        },
      ],
    });
  });

  it('allows navigation when the user is already authenticated', () => {
    TestBed.overrideProvider(AuthService, {
      useValue: {
        isLoggedIn: () => true,
        isKioskLoggedIn: () => false,
        requestKioskAccess: () => of({ Success: true, Token: 'token' }),
      },
    });

    const result = TestBed.runInInjectionContext(() => kioskGuard(null as never, null as never));

    expect(result).toBe(true);
  });

  it('allows navigation when kiosk access can be obtained', async () => {
    const result = TestBed.runInInjectionContext(() => kioskGuard(null as never, null as never));

    await expect(firstValueFrom(result as Observable<boolean | UrlTree>)).resolves.toBe(true);
  });

  it('redirects to /login when kiosk access fails', async () => {
    TestBed.overrideProvider(AuthService, {
      useValue: {
        isLoggedIn: () => false,
        isKioskLoggedIn: () => false,
        requestKioskAccess: () => of({ Success: false }),
      },
    });

    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() => kioskGuard(null as never, null as never));

    await expect(firstValueFrom(result as Observable<boolean | UrlTree>)).resolves.toSatisfy(
      (tree: UrlTree) => router.serializeUrl(tree) === '/login',
    );
  });

  it('redirects to /login when kiosk access throws', async () => {
    TestBed.overrideProvider(AuthService, {
      useValue: {
        isLoggedIn: () => false,
        isKioskLoggedIn: () => false,
        requestKioskAccess: () => throwError(() => new Error('network')),
      },
    });

    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() => kioskGuard(null as never, null as never));

    await expect(firstValueFrom(result as Observable<boolean | UrlTree>)).resolves.toSatisfy(
      (tree: UrlTree) => router.serializeUrl(tree) === '/login',
    );
  });
});
