import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit {
  activeTab: 'users' | 'audit' = 'users';
  users: Array<{ email: string; role: string; dateCreated: string }> = [];
  auditLogs: Array<{ email: string; action: string; details: string; timestamp: string }> = [];
  isLoadingUsers = false;
  isLoadingLogs = false;

  constructor(private auth: AuthService, private router: Router) { }

  ngOnInit(): void {
    if (!this.auth.isAdmin) {
      this.router.navigate(['/workflow']);
      return;
    }
    this.loadUsers();
  }

  switchTab(tab: 'users' | 'audit'): void {
    this.activeTab = tab;
    if (tab === 'users' && this.users.length === 0) this.loadUsers();
    if (tab === 'audit' && this.auditLogs.length === 0) this.loadAuditLogs();
  }

  loadUsers(): void {
    this.isLoadingUsers = true;
    this.auth.getUsers().subscribe({
      next: (users) => {
        this.users = users;
        this.isLoadingUsers = false;
      },
      error: () => { this.isLoadingUsers = false; }
    });
  }

  loadAuditLogs(): void {
    this.isLoadingLogs = true;
    this.auth.getAuditLogs().subscribe({
      next: (logs) => {
        this.auditLogs = logs;
        this.isLoadingLogs = false;
      },
      error: () => { this.isLoadingLogs = false; }
    });
  }
}
