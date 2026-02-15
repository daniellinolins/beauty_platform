import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import { ApiService } from 'src/app/services/api';
import { FormRendererComponent } from 'src/app/components/form-renderer/form-renderer.component';

@Component({
  selector: 'app-form-fill',
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, FormRendererComponent],
  templateUrl: './form-fill.page.html',
  styleUrls: ['./form-fill.page.scss'],
})
export class FormFillPage implements OnDestroy {
  private destroy$ = new Subject<void>();

  tenantId = 1;

  loading = true;

  idForm!: number;

  formName = '';
  versionId: number | null = null;

  // schema renderer
  elements: any[] = [];
  defaultLang = 'pt-PT';

  // submission/payload
  submissionId: number | null = null;
  payload: any = {};

  // ✅ parâmetros mínimos para criar submission
  clinicId = 1;
  clientId = 1;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
    private toastCtrl: ToastController
  ) {}

  ionViewWillEnter() {
    this.loading = true;

    const id = Number(this.route.snapshot.paramMap.get('idForm'));
    if (!id || Number.isNaN(id)) {
      this.loading = false;
      this.router.navigateByUrl('/forms');
      return;
    }

    this.idForm = id;

    // ✅ pega clinic_id e client_id via querystring (fallback 1)
    const qClinic = Number(this.route.snapshot.queryParamMap.get('clinic_id'));
    const qClient = Number(this.route.snapshot.queryParamMap.get('client_id'));
    if (qClinic && !Number.isNaN(qClinic)) this.clinicId = qClinic;
    if (qClient && !Number.isNaN(qClient)) this.clientId = qClient;

    this.loadFormMeta();
    this.loadPublishedOrLatestVersionAndCreateSubmission();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadFormMeta() {
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

  private async loadPublishedOrLatestVersionAndCreateSubmission() {
    try {
      const list: any = await firstValueFrom(this.api.listFormVersions(this.tenantId, this.idForm));
      const versions = Array.isArray(list) ? list : [];

      if (!versions.length) {
        this.loading = false;
        await this.toast('Nenhuma versão encontrada para este formulário.', 'warning');
        return;
      }

      const published = versions.find((v: any) => (v?.status || '').toUpperCase() === 'PUBLISHED');
      const picked = published || versions[0];

      this.versionId = picked?.id_form_version ?? null;
      if (!this.versionId) {
        this.loading = false;
        await this.toast('Versão inválida (sem id_form_version).', 'danger');
        return;
      }

      // schema_json pode vir string
      let schema: any = picked?.schema_json ?? null;
      try {
        if (typeof schema === 'string') schema = JSON.parse(schema);
      } catch {
        schema = null;
      }

      if (!schema) {
        this.loading = false;
        await this.toast('Schema inválido na versão do formulário.', 'danger');
        return;
      }

      this.defaultLang = this.mapDefaultLanguageToRenderer(schema?.default_language);

      // concatena elementos de todas as seções
      const sections = Array.isArray(schema?.sections) ? schema.sections : [];
      const all: any[] = [];
      for (const s of sections) {
        if (Array.isArray(s?.elements)) all.push(...s.elements);
      }
      this.elements = all;

      // ✅ cria submission automaticamente
      const submission = await firstValueFrom(
        this.api.createSubmission({
          tenant_id: this.tenantId,
          clinic_id: this.clinicId,
          client_id: this.clientId,
          id_form: this.idForm,
          id_form_version: this.versionId,
        })
      );

      this.submissionId = Number(submission?.id_form_submission || submission?.id);
      if (!this.submissionId) {
        // não bloqueia render, mas impede salvar
        await this.toast(
          'Submissão não retornou id. O formulário será exibido, mas não será possível salvar.',
          'warning'
        );
      }

      this.loading = false;
    } catch (e: any) {
      console.error(e);
      this.loading = false;
      await this.toast('Erro ao carregar versão publicada/criar submissão.', 'danger');
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
    if (!this.submissionId) {
      await this.toast(
        'Nenhuma submissão ativa para salvar. (Não foi possível criar submission ao entrar.)',
        'warning'
      );
      return;
    }

    this.api
      .saveSubmissionPayload(this.submissionId, this.tenantId, this.payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async () => {
          await this.toast('Submissão salva.', 'success');
        },
        error: async (e) => {
          console.error(e);
          await this.toast('Erro ao salvar submissão.', 'danger');
        },
      });
  }

  private async toast(message: string, color: 'success' | 'warning' | 'danger' | 'primary' = 'primary') {
    const t = await this.toastCtrl.create({
      message,
      duration: 2500,
      color,
    });
    await t.present();
  }
}
