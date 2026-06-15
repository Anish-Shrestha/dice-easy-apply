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
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (['pdf', 'docx', 'doc'].includes(ext)) {
      // Send binary to server for extraction
      this.isSaving = true;
      this.message = 'Uploading and extracting text...';
      this.messageType = 'success';
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]; // strip data:...;base64,
        const fileType = ext === 'doc' ? 'docx' : ext;
        this.auth.uploadResumeFile(base64, fileType).subscribe({
          next: (success) => {
            this.isSaving = false;
            if (success) {
              this.message = 'Resume uploaded and extracted!';
              this.loadResume(); // reload the extracted text
            } else {
              this.message = 'Failed to extract resume text';
              this.messageType = 'error';
            }
            setTimeout(() => this.message = '', 3000);
          },
          error: () => {
            this.isSaving = false;
            this.message = 'Failed to upload file';
            this.messageType = 'error';
          }
        });
      };
      reader.readAsDataURL(file);
    } else {
      // Plain text files (.txt, .md)
      const reader = new FileReader();
      reader.onload = () => {
        this.resume = reader.result as string;
      };
      reader.readAsText(file);
    }
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
