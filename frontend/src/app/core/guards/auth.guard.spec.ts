import { Router, UrlTree, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isLoggedIn: () => true,
          },
        },
      ],
    });
  });

  it('allows navigation when the user is authenticated', () => {
    const result = TestBed.runInInjectionContext(() => authGuard(null as never, null as never));

    expect(result).toBe(true);
  });

  it('redirects to /login when the user is not authenticated', () => {
    TestBed.overrideProvider(AuthService, {
      useValue: {
        isLoggedIn: () => false,
      },
    });

    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() => authGuard(null as never, null as never));
    const serialized = router.serializeUrl(result as UrlTree);

    expect(serialized).toBe('/login');
  });
});
