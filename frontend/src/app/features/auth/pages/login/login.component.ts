import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnInit {
  username = '';
  password = '';
  error = '';
  loading = false;

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.authService.getStatus().subscribe({
      next: (status) => {
        if (!status.HasAccount) {
          void this.router.navigate(['/setup']);
        }
      },
      error: () => {
        this.error = '';
      },
    });
  }

  submit(): void {
    this.error = '';
    this.loading = true;

    this.authService.login(this.username, this.password).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.Success) {
          void this.router.navigate(['/']);
          return;
        }
        this.error = response.Error ?? 'Unable to sign in.';
      },
      error: () => {
        this.loading = false;
        this.error = 'Invalid credentials.';
      },
    });
  }
}
