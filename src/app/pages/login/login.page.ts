import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService } from 'src/app/services/api';
import { AuthService } from '../../services/auth.service';
import { SessionService } from '../../services/session.service';

@Component({
  standalone: true,
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [CommonModule, FormsModule, IonicModule],
})
export class LoginPage {
  emailOrPhone = '';
  password = '';
  loading = false;

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private session: SessionService,
    private router: Router,
    private toast: ToastController,
  ) {}

  async onLogin() {
    if (!this.emailOrPhone || !this.password) {
      (await this.toast.create({ message: 'Informe email/telefone e senha.', duration: 2000 })).present();
      return;
    }

    this.loading = true;

    try {
      const res = await firstValueFrom(this.api.login(this.emailOrPhone, this.password));
      const token = res?.token || res?.access_token;

      if (!token) {
        throw new Error('Token não retornado pelo backend.');
      }

      this.auth.setToken(token);

      // carrega /api/me/context (se falhar, cai no catch)
      await this.session.loadContext();

      // rota principal do app
      await this.router.navigateByUrl('/folder/inbox');
    } catch (e: any) {
      const msg = e?.error?.error || e?.message || 'Falha no login';
      (await this.toast.create({ message: msg, duration: 2500 })).present();
    } finally {
      this.loading = false;
    }
  }
}
