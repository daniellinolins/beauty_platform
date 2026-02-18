import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';

import { ApiService } from 'src/app/services/api';
import { SessionService } from 'src/app/services/session.service';
import { ClinicContextService } from 'src/app/services/clinic-context.service';

type ClinicClientRow = {
  client_id: number;
  full_name?: string;
  email?: string;
  phone?: string;
  client_status?: string;
  relationship_status?: string;
  relationship_start?: string;
  relationship_end?: string | null;
};

@Component({
  selector: 'app-clinic-clients',
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule],
  templateUrl: './clinic-clients.page.html',
  styleUrls: ['./clinic-clients.page.scss'],
})
export class ClinicClientsPage implements OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;

  clinicId = 0;
  tenantId = 0;

  clinicName = '';

  segment: 'ACTIVE' | 'PENDING' = 'ACTIVE';
  clients: ClinicClientRow[] = [];

  constructor(
    private api: ApiService,
    private session: SessionService,
    private clinicCtx: ClinicContextService,
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {}

  async ionViewWillEnter() {
    this.loading = true;
    this.clients = [];

    // 1) precisa ter clínica ativa selecionada
    const active = this.clinicCtx.getActiveClinic();
    if (!active) {
      await this.toast('Selecione uma clínica para continuar.', 'warning');
      await this.router.navigateByUrl('/select-clinic');
      this.loading = false;
      return;
    }

    this.clinicId = Number(active.clinic_id || 0);
    this.tenantId = Number(active.tenant_id || 0);
    this.clinicName = active.clinic_name || '';

    if (this.clinicId <= 0 || this.tenantId <= 0) {
      await this.toast('Clínica ativa inválida. Selecione novamente.', 'warning');
      await this.router.navigateByUrl('/select-clinic');
      this.loading = false;
      return;
    }

    // 2) garante contexto carregado (caso precise)
    try {
      if (!this.session.context) {
        await this.session.loadContext();
      }
    } catch (e) {
      console.error(e);
      // não bloqueia
    }

    await this.loadClients();
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async onSegmentChanged(ev: any) {
    const value = (ev?.detail?.value || 'ACTIVE').toUpperCase();
    this.segment = value === 'PENDING' ? 'PENDING' : 'ACTIVE';
    await this.loadClients();
  }

  async loadClients(refresher?: HTMLIonRefresherElement) {
    try {
      this.loading = true;

      const status = this.segment;

      // Evita quebrar build caso o método ainda não esteja tipado no ApiService
      const rows = await firstValueFrom(
        (this.api as any).secureListClinicClients(this.clinicId, status)
      );

      this.clients = Array.isArray(rows) ? rows : [];
    } catch (e: any) {
      console.error(e);
      await this.toast('Erro ao listar clientes da clínica.', 'danger');
    } finally {
      this.loading = false;
      if (refresher) await refresher.complete();
    }
  }

  // ------------------------------
  // Ações: Solicitar associação (cliente existente)
  // ------------------------------
  async openRequestLinkModal() {
    const alert = await this.alertCtrl.create({
      header: 'Solicitar associação',
      message: 'Informe o e-mail ou telefone do cliente já cadastrado na plataforma.',
      inputs: [
        { name: 'emailOrPhone', type: 'text', placeholder: 'email@... ou 3519...' },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Enviar código',
          handler: async (data) => {
            const emailOrPhone = (data?.emailOrPhone || '').trim();
            if (!emailOrPhone) {
              await this.toast('Informe e-mail ou telefone.', 'warning');
              return false;
            }

            try {
              const res: any = await firstValueFrom(
                (this.api as any).secureRequestLinkExistingClient(
                  this.clinicId,
                  emailOrPhone,
                  'INBOX'
                )
              );

              const code = res?.dev_code ? ` (dev_code: ${res.dev_code})` : '';
              await this.toast(`Solicitação enviada${code}`, 'success');
              this.segment = 'PENDING';
              await this.loadClients();
            } catch (e: any) {
              console.error(e);
              await this.toast('Falha ao solicitar associação.', 'danger');
            }

            return true;
          },
        },
      ],
    });

    await alert.present();
  }

  // ------------------------------
  // Ações: Criar cliente + solicitar associação
  // ------------------------------
  async openCreateClientModal() {
    const alert = await this.alertCtrl.create({
      header: 'Cadastrar cliente',
      message: 'Cria o cliente (global) + envia solicitação de vínculo para esta clínica.',
      inputs: [
        { name: 'full_name', type: 'text', placeholder: 'Nome completo' },
        { name: 'email', type: 'email', placeholder: 'E-mail' },
        { name: 'phone', type: 'text', placeholder: 'Telefone (opcional)' },
        { name: 'temp_password', type: 'text', placeholder: 'Senha temporária (padrão: 123456)' },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Criar e solicitar',
          handler: async (data) => {
            const full_name = (data?.full_name || '').trim();
            const email = (data?.email || '').trim();
            const phone = (data?.phone || '').trim();
            const temp_password = (data?.temp_password || '').trim();

            if (!full_name || !email) {
              await this.toast('Nome e e-mail são obrigatórios.', 'warning');
              return false;
            }

            try {
              const res: any = await firstValueFrom(
                (this.api as any).secureCreateClientAndRequestLink(this.clinicId, {
                  full_name,
                  email,
                  phone: phone || undefined,
                  temp_password: temp_password || undefined,
                  channel: 'INBOX',
                })
              );

              const authCode = res?.dev_auth_code ? ` (dev_auth_code: ${res.dev_auth_code})` : '';
              const pwd = res?.temp_password ? ` senha temp: ${res.temp_password}` : '';
              await this.toast(`Cliente criado e solicitação enviada.${authCode}${pwd}`, 'success');

              this.segment = 'PENDING';
              await this.loadClients();
            } catch (e: any) {
              console.error(e);
              await this.toast('Falha ao criar cliente.', 'danger');
            }

            return true;
          },
        },
      ],
    });

    await alert.present();
  }

  trackByClientId(_: number, row: ClinicClientRow) {
    return row.client_id;
  }

  private async toast(message: string, color: 'success' | 'warning' | 'danger' | 'primary' = 'primary') {
    const t = await this.toastCtrl.create({ message, duration: 2600, color });
    await t.present();
  }
}
