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

  getAuthHeaders(): HttpHeaders {
    return new HttpHeaders({ 'Authorization': `Bearer ${this.token}` });
  }

  login(email: string, password: string): Observable<{ token: string; email: string }> {
    return this.http.post<{ token: string; email: string }>(
      `${environment.apiUrl}/auth/login`,
      { email, password }
    ).pipe(
      tap(result => {
        localStorage.setItem(this.tokenKey, result.token);
        localStorage.setItem(this.userKey, result.email);
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
        this.isLoggedIn$.next(true);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
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

  private hasToken(): boolean {
    return !!localStorage.getItem(this.tokenKey);
  }
}
