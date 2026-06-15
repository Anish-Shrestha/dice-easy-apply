import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = localStorage.getItem('dice_auth_token') || '';
    if (token && req.url.includes('/api/')) {
      const cloned = req.clone({
        setHeaders: { 'x-auth-token': token }
      });
      return next.handle(cloned);
    }
    return next.handle(req);
  }
}
