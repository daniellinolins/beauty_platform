import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import { ApiService } from 'src/app/services/api';
import { SessionService } from 'src/app/services/session.service';
import { FormRendererComponent } from 'src/app/components/form-renderer/form-renderer.component';

type ClinicClientRow = {
  client_id: number;
  full_name?: string;
  email?: string;
  phone?: string;
  client_status?: string;
  relationship_status?: string;
};

@Component({
  selector: 'app-form-fill',
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, FormRendererComponent],
  templateUrl: './form-fill.page.html',
  styleUrls: ['./form-fill.page.scss'],
})
export class FormFillPage implements OnDestroy {
  private destroy$ = new Subject<void>();

  tenantId = 0;
  loading = true;

  idForm!: number;

  formName = '';
  versionId = 0;

  elements: any[] = [];
  defaultLang = 'pt-PT';

  submissionId = 0;
  payload: any = {};

  clinicId = 0;
  clientId = 0;

  private userType: string = '';

  // UI state
  clientSelectionRequired = false;
  selectedClientLabel = '';
  clinicClients: ClinicClientRow[] = [];
  creatingSubmission = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
    private session: SessionService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController
  ) {}

  async ionViewWillEnter() {
    this.loading = true;
    this.clientSelectionRequired = false;
    this.submissionId = 0;
    this.selectedClientLabel = '';
    this.creatingSubmission = false;

    const id = Number(this.route.snapshot.paramMap.get('idForm'));
    if (!id || Number.isNaN(id)) {
      this.loading = false;
      this.router.navigateByUrl('/forms');
      return;
    }
    this.idForm = id;

    // query params
    const qClinic = Number(this.route.snapshot.queryParamMap.get('clinic_id'));
    const qClient = Number(this.route.snapshot.queryParamMap.get('client_id'));
    if (qClinic > 0 && !Number.isNaN(qClinic)) this.clinicId = qClinic;
    if (qClient > 0 && !Number.isNaN(qClient)) this.clientId = qClient;

    // context
    await this.resolveContextDefaults();

    if (this.tenantId <= 0) {
      this.loading = false;
      await this.toast('Não foi possível identificar o tenant do usuário logado. Faça login novamente.', 'danger');
      return;
    }

    if (this.clinicId <= 0) {
      this.loading = false;
      await this.toast(
        'clinic_id não definido. Acesse o formulário com ?clinic_id=... (ou associe uma clínica ao usuário no contexto).',
        'warning'
      );
      return;
    }

    this.loadFormMeta();

    // Sempre carrega e renderiza o form
    const okLoaded = await this.loadPublishedOrLatestVersion();
    if (!okLoaded) return;

    // Se for clínica e não tiver client_id: exigir seleção (sem toast inicial)
    if (this.userType !== 'CLIENT' && this.clientId <= 0) {
      this.clientSelectionRequired = true;
      await this.loadClinicClients(); // carrega lista para o picker
      this.loading = false;
      return;
    }

    // Caso CLIENT (ou clínica com client_id): tenta criar submissão
    await this.createSubmissionSecure();
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async resolveContextDefaults() {
    try {
      if (!this.session.context) {
        await this.session.loadContext();
      }

      const ctx: any = this.session.context;
      const user: any = ctx?.user;
      const clinics: any[] = Array.isArray(ctx?.clinics) ? ctx.clinics : [];

      this.userType = (user?.user_type || '').toString();

      // tenantId
      if (user?.user_type !== 'CLIENT' && user?.tenant_id) {
        this.tenantId = Number(user.tenant_id) || 0;
      } else if (clinics.length > 0 && clinics[0]?.tenant_id) {
        this.tenantId = Number(clinics[0].tenant_id) || 0;
      }

      // clinicId default
      if (this.clinicId <= 0 && clinics.length > 0 && clinics[0]?.clinic_id) {
        this.clinicId = Number(clinics[0].clinic_id) || 0;
      }

      // clientId for CLIENT
      if (user?.user_type === 'CLIENT' && user?.client_id && this.clientId <= 0) {
        this.clientId = Number(user.client_id) || 0;
      }
    } catch (e) {
      console.error('Falha ao carregar /api/me/context:', e);
    }
  }

  private loadFormMeta() {
    if (this.tenantId <= 0) return;

    this.api
      .listForms(this.tenantId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (list) => {
          const found = (list || []).find((f: any) => Number(f?.id_form) === Number(this.idForm));
          if (found?.name) this.formName = found.name;
        },
        error: () => {},
      });
  }

  private mapDefaultLanguageToRenderer(schemaDefaultLang: any): string {
    const s = (schemaDefaultLang ?? '').toString();
    if (s === 'pt-PT' || s === 'pt-BR' || s === 'en-US' || s === 'es-ES') return s;
    if (s === 'pt') return 'pt-PT';
    if (s === 'en') return 'en-US';
    if (s === 'es') return 'es-ES';
    return 'pt-PT';
  }

  private async loadPublishedOrLatestVersion(): Promise<boolean> {
    try {
      const versions: any[] = await firstValueFrom(this.api.listFormVersions(this.tenantId, this.idForm));
      if (!versions.length) {
        this.loading = false;
        await this.toast('Nenhuma versão encontrada para este formulário.', 'warning');
        return false;
      }

      const published = versions.find((v: any) => (v?.status || '').toUpperCase() === 'PUBLISHED');
      const picked = published || versions[0];

      this.versionId = Number(picked?.id_form_version || 0);
      if (this.versionId <= 0) {
        this.loading = false;
        await this.toast('Versão inválida (sem id_form_version).', 'danger');
        return false;
      }

      let schema: any = picked?.schema_json ?? null;
      try {
        if (typeof schema === 'string') schema = JSON.parse(schema);
      } catch {
        schema = null;
      }

      if (!schema) {
        this.loading = false;
        await this.toast('Schema inválido na versão do formulário.', 'danger');
        return false;
      }

      this.defaultLang = this.mapDefaultLanguageToRenderer(schema?.default_language);

      const sections = Array.isArray(schema?.sections) ? schema.sections : [];
      const all: any[] = [];
      for (const s of sections) {
        if (Array.isArray(s?.elements)) all.push(...s.elements);
      }
      this.elements = all;

      if (!this.elements.length) {
        this.loading = false;
        await this.toast('Nenhum elemento no formulário.', 'warning');
        return false;
      }

      return true;
    } catch (e) {
      console.error(e);
      this.loading = false;
      await this.toast('Erro ao carregar versão do formulário.', 'danger');
      return false;
    }
  }

  // -----------------------------
  // CLIENT SELECTION (Clinic User)
  // -----------------------------
  private async loadClinicClients() {
    try {
      // precisa existir no ApiService
      const rows: ClinicClientRow[] = await firstValueFrom(
        // @ts-ignore
        this.api.secureListClinicClients(this.clinicId, 'ACTIVE')
      );
      this.clinicClients = Array.isArray(rows) ? rows : [];
    } catch (e) {
      console.error(e);
      this.clinicClients = [];
      await this.toast('Não foi possível carregar a lista de clientes desta clínica.', 'danger');
    }
  }

  async openClientPicker() {
    if (!this.clinicId || this.clinicId <= 0) {
      await this.toast('clinic_id inválido para selecionar cliente.', 'danger');
      return;
    }

    if (!this.clinicClients.length) {
      await this.loadClinicClients();
    }

    if (!this.clinicClients.length) {
      await this.toast(
        'Nenhum cliente ativo associado a esta clínica. Solicite associação de um cliente para poder salvar submissões.',
        'warning'
      );
      return;
    }

    const inputs = this.clinicClients.slice(0, 60).map((c) => {
      const label = `${c.full_name || 'Sem nome'}${c.email ? ' • ' + c.email : ''}${c.phone ? ' • ' + c.phone : ''}`;
      return {
        type: 'radio' as const,
        label,
        value: c.client_id,
        checked: Number(c.client_id) === Number(this.clientId),
      };
    });

    const alert = await this.alertCtrl.create({
      header: 'Selecionar cliente',
      message: 'Escolha um cliente ativo associado a esta clínica:',
      inputs,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Selecionar',
          handler: async (clientId: number) => {
            if (clientId && Number(clientId) > 0) {
              await this.selectClient(Number(clientId));
            }
            return true;
          },
        },
      ],
    });

    await alert.present();
  }

  private findClientLabel(clientId: number): string {
    const c = this.clinicClients.find((x) => Number(x.client_id) === Number(clientId));
    if (!c) return `Cliente #${clientId}`;
    const parts = [c.full_name || `Cliente #${clientId}`];
    if (c.email) parts.push(c.email);
    if (c.phone) parts.push(c.phone);
    return parts.join(' • ');
  }

  private async selectClient(clientId: number) {
    this.clientId = clientId;
    this.selectedClientLabel = this.findClientLabel(clientId);
    this.clientSelectionRequired = false;
    await this.createSubmissionSecure();
  }

  // -----------------------------
  // SUBMISSION (SECURE)
  // -----------------------------
  private async createSubmissionSecure() {
    if (this.creatingSubmission) return;
    this.creatingSubmission = true;

    try {
      const submission = await firstValueFrom(
        this.api.secureCreateSubmission({
          clinic_id: this.clinicId,
          client_id: this.clientId > 0 ? this.clientId : undefined,
          id_form: this.idForm,
          id_form_version: this.versionId,
        })
      );

      this.submissionId = Number(submission?.id_form_submission || submission?.id || 0);

      if (this.submissionId <= 0) {
        await this.toast('Submissão não retornou id. Não será possível salvar.', 'warning');
      }
    } catch (e: any) {
      console.error(e);
      await this.toast('Erro ao criar submissão (secure).', 'danger');
      if (this.userType !== 'CLIENT') this.clientSelectionRequired = true;
    } finally {
      this.creatingSubmission = false;
    }
  }

  async onRendererError(err: unknown) {
    console.error('Renderer error:', err);
    let msg = 'Erro ao renderizar formulário.';
    if (typeof err === 'string') msg = err;
    else if (err && typeof err === 'object') {
      const anyErr: any = err;
      if (typeof anyErr?.message === 'string' && anyErr.message.trim()) msg = anyErr.message;
    }
    await this.toast(msg, 'danger');
  }

  async save() {
    if (this.submissionId <= 0) {
      if (this.userType !== 'CLIENT') {
        this.clientSelectionRequired = true;
        await this.toast('Selecione um cliente para permitir salvar.', 'warning');
      } else {
        await this.toast('Sem submissão ativa.', 'warning');
      }
      return;
    }

    this.api
      .secureSaveSubmissionPayload(this.submissionId, this.payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async () => await this.toast('Submissão salva.', 'success'),
        error: async (e) => {
          console.error(e);
          await this.toast('Erro ao salvar submissão.', 'danger');
        },
      });
  }

  private async toast(message: string, color: 'success' | 'warning' | 'danger' | 'primary' = 'primary') {
    const t = await this.toastCtrl.create({ message, duration: 2600, color });
    await t.present();
  }
}
