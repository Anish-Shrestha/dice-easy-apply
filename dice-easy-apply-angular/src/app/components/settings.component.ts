import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  userEmail = '';
  resume = '';
  isLoading = false;
  isSaving = false;
  message = '';
  messageType: 'success' | 'error' = 'success';

  constructor(private auth: AuthService, private router: Router) { }

  ngOnInit(): void {
    this.userEmail = this.auth.userEmail;
    this.loadResume();
  }

  loadResume(): void {
    this.isLoading = true;
    this.auth.getResume().subscribe({
      next: (resume) => {
        this.resume = resume;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  saveResume(): void {
    this.isSaving = true;
    this.message = '';
    this.auth.updateResume(this.resume).subscribe({
      next: (success) => {
        this.isSaving = false;
        this.message = success ? 'Resume saved successfully!' : 'Failed to save resume';
        this.messageType = success ? 'success' : 'error';
        setTimeout(() => this.message = '', 3000);
      },
      error: () => {
        this.isSaving = false;
        this.message = 'Failed to save resume';
        this.messageType = 'error';
      }
    });
  }

  onFileUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      this.resume = reader.result as string;
    };
    reader.readAsText(file);
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
