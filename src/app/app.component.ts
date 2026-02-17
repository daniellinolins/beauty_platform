import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './services/auth.service';
import { SessionService } from './services/session.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  public appPages = [
    { title: 'Inbox', url: '/folder/inbox', icon: 'mail' },
    { title: 'Formulários', url: '/forms', icon: 'document-text' },
    { title: 'Outbox', url: '/folder/outbox', icon: 'paper-plane' },
    { title: 'Favorites', url: '/folder/favorites', icon: 'heart' },
    { title: 'Archived', url: '/folder/archived', icon: 'archive' },
    { title: 'Trash', url: '/folder/trash', icon: 'trash' },
    { title: 'Spam', url: '/folder/spam', icon: 'warning' },
  ];

  public labels = ['Family', 'Friends', 'Notes', 'Work', 'Travel', 'Reminders'];

  constructor(
    private router: Router,
    private auth: AuthService,
    private session: SessionService,
  ) {
    this.bootstrap();
  }

  private async bootstrap() {
    // Se já tem token salvo, tenta carregar o contexto e entrar no app.
    if (this.auth.hasToken()) {
      try {
        await this.session.loadContext();
        // rota principal (como você pediu)
        if (this.router.url === '/' || this.router.url.startsWith('/login')) {
          this.router.navigateByUrl('/folder/inbox');
        }
        return;
      } catch (e) {
        // token inválido/expirado → limpa e manda pro login
        this.auth.logout();
      }
    }

    if (!this.router.url.startsWith('/login')) {
      this.router.navigateByUrl('/login');
    }
  }
}
