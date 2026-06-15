import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private tokenKey = 'dice_auth_token';
  private userKey = 'dice_auth_user';
  private roleKey = 'dice_auth_role';
  private isLoggedIn$ = new BehaviorSubject<boolean>(this.hasToken());

  constructor(private http: HttpClient) { }

  get isAuthenticated$(): Observable<boolean> {
    return this.isLoggedIn$.asObservable();
  }

  get isAuthenticated(): boolean {
    return this.hasToken();
  }

  get token(): string {
    return localStorage.getItem(this.tokenKey) || '';
  }

  get userEmail(): string {
    return localStorage.getItem(this.userKey) || '';
  }

  get userRole(): string {
    return localStorage.getItem(this.roleKey) || 'user';
  }

  get isAdmin(): boolean {
    return this.userRole === 'admin';
  }

  getAuthHeaders(): HttpHeaders {
    return new HttpHeaders({ 'x-auth-token': this.token });
  }

  login(email: string, password: string): Observable<{ token: string; email: string; role?: string }> {
    return this.http.post<{ token: string; email: string; role?: string }>(
      `${environment.apiUrl}/auth/login`,
      { email, password }
    ).pipe(
      tap(result => {
        localStorage.setItem(this.tokenKey, result.token);
        localStorage.setItem(this.userKey, result.email);
        localStorage.setItem(this.roleKey, result.role || 'user');
        this.isLoggedIn$.next(true);
      })
    );
  }

  register(email: string, password: string): Observable<{ token: string; email: string }> {
    return this.http.post<{ token: string; email: string }>(
      `${environment.apiUrl}/auth/register`,
      { email, password }
    ).pipe(
      tap(result => {
        localStorage.setItem(this.tokenKey, result.token);
        localStorage.setItem(this.userKey, result.email);
        localStorage.setItem(this.roleKey, 'user');
        this.isLoggedIn$.next(true);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    localStorage.removeItem(this.roleKey);
    this.isLoggedIn$.next(false);
  }

  getResume(): Observable<string> {
    return this.http.get<{ resume: string }>(
      `${environment.apiUrl}/user/resume`,
      { headers: this.getAuthHeaders() }
    ).pipe(
      map(r => r.resume || ''),
      catchError(() => of(''))
    );
  }

  updateResume(resume: string): Observable<boolean> {
    return this.http.post<{ updated: boolean }>(
      `${environment.apiUrl}/user/resume`,
      { resume },
      { headers: this.getAuthHeaders() }
    ).pipe(
      map(r => r?.updated || false),
      catchError(() => of(false))
    );
  }

  uploadResumeFile(fileContent: string, fileType: string): Observable<boolean> {
    return this.http.post<{ updated: boolean }>(
      `${environment.apiUrl}/user/resume`,
      { fileContent, fileType },
      { headers: this.getAuthHeaders() }
    ).pipe(
      map(r => r?.updated || false),
      catchError(() => of(false))
    );
  }

  // Admin endpoints (consolidated into auth/me with action query param)
  getUsers(): Observable<Array<{ email: string; role: string; dateCreated: string }>> {
    return this.http.get<{ users: Array<{ email: string; role: string; dateCreated: string }> }>(
      `${environment.apiUrl}/auth/me?action=users`,
      { headers: this.getAuthHeaders() }
    ).pipe(
      map(r => r.users || []),
      catchError(() => of([]))
    );
  }

  getAuditLogs(): Observable<Array<{ email: string; action: string; details: string; timestamp: string }>> {
    return this.http.get<{ logs: Array<{ email: string; action: string; details: string; timestamp: string }> }>(
      `${environment.apiUrl}/auth/me?action=audit`,
      { headers: this.getAuthHeaders() }
    ).pipe(
      map(r => r.logs || []),
      catchError(() => of([]))
    );
  }

  private hasToken(): boolean {
    return !!localStorage.getItem(this.tokenKey);
  }
}
