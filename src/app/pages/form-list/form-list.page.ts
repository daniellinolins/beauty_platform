import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonList,
  IonItem,
  IonLabel,
  IonFab,
  IonFabButton,
  IonIcon,
  IonButtons,
  IonButton,
  ToastController,
} from '@ionic/angular/standalone';
import { Router, RouterModule } from '@angular/router';
import { ApiService } from 'src/app/services/api';
import { SessionService } from 'src/app/services/session.service';

@Component({
  selector: 'app-form-list',
  templateUrl: './form-list.page.html',
  styleUrls: ['./form-list.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,

    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonList,
    IonItem,
    IonLabel,
    IonFab,
    IonFabButton,
    IonIcon,
    IonButtons,
    IonButton,
  ],
})
export class FormListPage {
  forms: any[] = [];
  tenantId: number | null = null;

  // ✅ Se seu app usa Tabs e o caminho real for /tabs/forms,
  // troque aqui para: '/tabs/forms'
  private formsBasePath = '/forms';

  constructor(
    private api: ApiService,
    private session: SessionService,
    private router: Router,
    private toastCtrl: ToastController
  ) {}

  async ionViewWillEnter() {
    await this.load();
  }

  private async resolveTenantIdFromContext(): Promise<number | null> {
    // garante contexto carregado
    if (!this.session.context) {
      try {
        await this.session.loadContext();
      } catch (e) {
        console.error(e);
        return null;
      }
    }

    const ctx = this.session.context;
    const user = ctx?.user;
    if (!user) return null;

    // Clinic user: tenant_id vem do user
    if (user.user_type !== 'CLIENT') {
      const tid = Number(user.tenant_id);
      return tid && !Number.isNaN(tid) ? tid : null;
    }

    // CLIENT: pode ter múltiplos tenants; aqui usamos o primeiro vínculo por padrão
    const clinics = Array.isArray(ctx?.clinics) ? ctx.clinics : [];
    if (clinics.length === 0) return null;

    const tid = Number(clinics[0]?.tenant_id);
    return tid && !Number.isNaN(tid) ? tid : null;
  }

  async load() {
    const tid = await this.resolveTenantIdFromContext();
    if (!tid) {
      await this.toast('Não foi possível resolver o tenant do usuário logado.', 'danger');
      this.forms = [];
      return;
    }

    this.tenantId = tid;

    this.api.listForms(this.tenantId).subscribe({
      next: (list) => (this.forms = list || []),
      error: async (err) => {
        console.error(err);
        await this.toast('Erro ao listar formulários.', 'danger');
      },
    });
  }

  newForm() {
    this.router.navigateByUrl(`${this.formsBasePath}/builder`);
  }

  editUrl(form: any): string {
    return `${this.formsBasePath}/builder/${form.id_form}`;
  }

  fillUrl(form: any): string {
    return `${this.formsBasePath}/fill/${form.id_form}`;
  }

  editForm(form: any) {
    this.router.navigateByUrl(this.editUrl(form));
  }

  openForm(form: any) {
    this.router.navigateByUrl(this.fillUrl(form));
  }

  private async toast(message: string, color: 'success' | 'warning' | 'danger' | 'primary' = 'primary') {
    const t = await this.toastCtrl.create({ message, duration: 2500, color });
    await t.present();
  }
}
