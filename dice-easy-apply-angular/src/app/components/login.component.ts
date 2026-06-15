import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  email = '';
  password = '';
  isRegister = false;
  error = '';
  isLoading = false;

  constructor(private auth: AuthService, private router: Router) {
    if (this.auth.isAuthenticated) {
      this.router.navigate(['/workflow']);
    }
  }

  submit(): void {
    if (!this.email || !this.password) {
      this.error = 'Email and password are required';
      return;
    }

    this.isLoading = true;
    this.error = '';

    const action$ = this.isRegister
      ? this.auth.register(this.email, this.password)
      : this.auth.login(this.email, this.password);

    action$.subscribe({
      next: () => {
        this.isLoading = false;
        window.location.href = '/workflow';
      },
      error: (err) => {
        this.isLoading = false;
        this.error = err?.error?.error || 'Authentication failed';
      }
    });
  }

  toggleMode(): void {
    this.isRegister = !this.isRegister;
    this.error = '';
  }
}
