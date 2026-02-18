import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService } from 'src/app/services/api';
import { SessionService } from 'src/app/services/session.service';
import { ClinicContextService } from 'src/app/services/clinic-context.service';

@Component({
  selector: 'app-select-clinic',
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule],
  templateUrl: './select-clinic.page.html',
  styleUrls: ['./select-clinic.page.scss'],
})
export class SelectClinicPage {
  loading = true;
  clinics: any[] = [];

  constructor(
    private api: ApiService,
    private session: SessionService,
    private clinicCtx: ClinicContextService,
    private router: Router,
    private toastCtrl: ToastController
  ) {}

  async ionViewWillEnter() {
    this.loading = true;

    try {
      // garante contexto atualizado
      await this.session.loadContext();
      const ctx = this.session.context;

      this.clinics = Array.isArray(ctx?.clinics) ? ctx.clinics : [];

      if (!this.clinics.length) {
        await this.toast('Seu usuário não possui clínicas associadas.', 'warning');
        await this.router.navigateByUrl('/login');
        return;
      }

      // se só tiver 1, já seleciona
      if (this.clinics.length === 1) {
        const c = this.clinics[0];
        this.clinicCtx.setActiveClinic({
          clinic_id: Number(c.clinic_id),
          tenant_id: Number(c.tenant_id),
          clinic_name: c.clinic_name || c.name || undefined,
        });
        await this.router.navigateByUrl('/folder/inbox');
        return;
      }
    } catch (e) {
      console.error(e);
      await this.toast('Erro ao carregar contexto.', 'danger');
    } finally {
      this.loading = false;
    }
  }

  async chooseClinic(c: any) {
    const clinic_id = Number(c?.clinic_id || 0);
    const tenant_id = Number(c?.tenant_id || 0);

    if (!clinic_id || !tenant_id) {
      await this.toast('Clínica inválida.', 'danger');
      return;
    }

    this.clinicCtx.setActiveClinic({
      clinic_id,
      tenant_id,
      clinic_name: c?.clinic_name || c?.name || undefined,
    });

    await this.toast('Clínica selecionada.', 'success');
    await this.router.navigateByUrl('/folder/inbox');
  }

  private async toast(message: string, color: 'success' | 'warning' | 'danger' | 'primary' = 'primary') {
    const t = await this.toastCtrl.create({ message, duration: 2200, color });
    await t.present();
  }
}
