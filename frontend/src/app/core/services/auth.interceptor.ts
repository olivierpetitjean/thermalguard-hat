import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getRequestToken();

  const request = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !request.url.includes('/api/auth/')) {
        if (window.location.pathname.startsWith('/kiosk')) {
          authService.clearKioskToken();
          void router.navigate(['/login']);
        } else {
          authService.logout();
          void router.navigate(['/login']);
        }
      }
      return throwError(() => error);
    }),
  );
};
