import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './setup.component.html',
  styleUrl: './setup.component.css',
})
export class SetupComponent {
  username = '';
  password = '';
  confirm = '';
  error = '';
  loading = false;

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  submit(): void {
    if (this.password !== this.confirm) {
      this.error = 'Passwords do not match.';
      return;
    }

    this.error = '';
    this.loading = true;

    this.authService.setup(this.username, this.password).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.Success) {
          void this.router.navigate(['/']);
          return;
        }
        this.error = response.Error ?? 'Unable to create account.';
      },
      error: () => {
        this.loading = false;
        this.error = 'Unable to create account.';
      },
    });
  }
}
