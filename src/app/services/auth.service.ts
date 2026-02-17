import { Injectable } from '@angular/core';

const TOKEN_KEY = 'bp_access_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  hasToken(): boolean {
    return !!this.getToken();
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
  }
}
