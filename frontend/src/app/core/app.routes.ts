import { Routes } from '@angular/router';
import { DashboardComponent } from '../features/dashboard/pages/dashboard.component';
import { KioskComponent } from '../features/kiosk/pages/kiosk.component';
import { LoginComponent } from '../features/auth/pages/login/login.component';
import { SetupComponent } from '../features/auth/pages/setup/setup.component';
import { authGuard } from './guards/auth.guard';
import { kioskGuard } from './guards/kiosk.guard';

export const routes: Routes = [
  { path: '', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'kiosk', component: KioskComponent, canActivate: [kioskGuard] },
  { path: 'login', component: LoginComponent },
  { path: 'setup', component: SetupComponent },
  { path: '**', redirectTo: '' },
];
