import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const kioskGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn() || authService.isKioskLoggedIn()) {
    return true;
  }

  return authService.requestKioskAccess().pipe(
    map((response) => {
      if (response.Success && response.Token) {
        return true;
      }

      return router.createUrlTree(['/login']);
    }),
    catchError(() => of(router.createUrlTree(['/login']))),
  );
};
