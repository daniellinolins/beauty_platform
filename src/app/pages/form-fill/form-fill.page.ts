import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { Subject, takeUntil } from 'rxjs';
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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
    private toastCtrl: ToastController
  ) {}

  ionViewWillEnter() {
    this.loading = true;

    // ✅ CORREÇÃO: sua rota usa :idForm (não :id)
    const id = Number(this.route.snapshot.paramMap.get('idForm'));
    if (!id || Number.isNaN(id)) {
      this.loading = false;
      this.router.navigateByUrl('/forms');
      return;
    }

    this.idForm = id;

    // opcional: melhora o título sem depender do backend das versões
    this.loadFormMeta();

    // carrega versão para preencher
    this.loadPublishedOrLatestVersion();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadFormMeta() {
    // listForms é o que você já tem no ApiService
    this.api
      .listForms(this.tenantId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (list) => {
          const found = (list || []).find((f: any) => Number(f?.id_form) === Number(this.idForm));
          if (found?.name) this.formName = found.name;
        },
        error: () => {
          // não é crítico
        },
      });
  }

  private mapDefaultLanguageToRenderer(schemaDefaultLang: any): string {
    const s = (schemaDefaultLang ?? '').toString();

    // se já vier completo, mantém
    if (s === 'pt-PT' || s === 'pt-BR' || s === 'en-US' || s === 'es-ES') return s;

    // seu schema normalmente salva curto: pt/en/es
    if (s === 'pt') return 'pt-PT';
    if (s === 'en') return 'en-US';
    if (s === 'es') return 'es-ES';

    return 'pt-PT';
  }

  private loadPublishedOrLatestVersion() {
    this.api
      .listFormVersions(this.tenantId, this.idForm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async (list: any) => {
          const versions = Array.isArray(list) ? list : [];

          if (!versions.length) {
            this.loading = false;
            const t = await this.toastCtrl.create({
              message: 'Nenhuma versão encontrada para este formulário.',
              duration: 2500,
              color: 'warning',
            });
            await t.present();
            return;
          }

          // ✅ preferência para PUBLISHED
          const published = versions.find((v: any) => (v?.status || '').toUpperCase() === 'PUBLISHED');
          const picked = published || versions[0]; // versions já vem DESC no backend

          this.versionId = picked?.id_form_version ?? null;

          // schema_json pode vir string
          let schema: any = picked?.schema_json ?? null;
          try {
            if (typeof schema === 'string') schema = JSON.parse(schema);
          } catch {
            schema = null;
          }

          if (!schema) {
            this.loading = false;
            const t = await this.toastCtrl.create({
              message: 'Schema inválido na versão do formulário.',
              duration: 2500,
              color: 'danger',
            });
            await t.present();
            return;
          }

          this.defaultLang = this.mapDefaultLanguageToRenderer(schema?.default_language);

          // Seu schema é { sections:[{elements:[]}] }
          const sections = Array.isArray(schema?.sections) ? schema.sections : [];
          if (sections.length > 0) {
            // por enquanto, renderiza todas as seções em sequência (concat)
            // se seu renderer suporta "sections", você pode adaptar depois.
            const all: any[] = [];
            for (const s of sections) {
              if (Array.isArray(s?.elements)) all.push(...s.elements);
            }
            this.elements = all;
          } else {
            // fallback se existir schema antigo
            this.elements = Array.isArray(schema?.elements) ? schema.elements : [];
          }

          if (!this.elements.length) {
            // não bloqueia, mas avisa
            const t = await this.toastCtrl.create({
              message: 'Aviso: versão carregada não possui elementos.',
              duration: 2200,
              color: 'warning',
            });
            await t.present();
          }

          this.loading = false;
        },
        error: async (err) => {
          console.error(err);
          this.loading = false;
          const t = await this.toastCtrl.create({
            message: 'Erro ao carregar versões do formulário.',
            duration: 2500,
            color: 'danger',
          });
          await t.present();
        },
      });
  }

  async onRendererError(err: unknown) {
    console.error('Renderer error:', err);

    let msg = 'Erro ao renderizar formulário.';
    if (typeof err === 'string') msg = err;
    else if (err && typeof err === 'object') {
      const anyErr: any = err;
      if (typeof anyErr?.message === 'string' && anyErr.message.trim()) {
        msg = anyErr.message;
      }
    }

    const t = await this.toastCtrl.create({
      message: msg,
      duration: 3000,
      color: 'danger',
    });
    await t.present();
  }

  async save() {
    // Mantive seu comportamento: se não existir submissionId, avisa
    if (!this.submissionId) {
      const t = await this.toastCtrl.create({
        message:
          'Nenhuma submissão ativa para salvar. (Se você quer salvar no backend, precisamos criar uma submission antes.)',
        duration: 2800,
        color: 'warning',
      });
      await t.present();
      return;
    }

    this.api
      .saveSubmissionPayload(this.submissionId, this.tenantId, this.payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async () => {
          const t = await this.toastCtrl.create({
            message: 'Submissão salva.',
            duration: 1800,
            color: 'success',
          });
          await t.present();
        },
        error: async (e) => {
          console.error(e);
          const t = await this.toastCtrl.create({
            message: 'Erro ao salvar submissão.',
            duration: 2500,
            color: 'danger',
          });
          await t.present();
        },
      });
  }
}
