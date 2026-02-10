import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { Subject, takeUntil } from 'rxjs';
import { ApiService } from 'src/app/services/api';
import { FormRendererComponent } from 'src/app/components/form-renderer/form-renderer.component';

@Component({
  selector: 'app-form-fill',
  standalone: true,
  imports: [CommonModule, IonicModule, FormRendererComponent],
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

    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id || Number.isNaN(id)) {
      this.loading = false;
      this.router.navigateByUrl('/forms');
      return;
    }

    this.idForm = id;
    this.loadLatest();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadLatest() {
    this.api
      .listFormVersions(this.tenantId, this.idForm)
      //.getLatestFormVersion(this.tenantId, this.idForm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          // Esperado do backend (exemplos comuns):
          // res.form.name, res.version.id_form_version, res.version.schema_json, etc.
          const form = res?.form || {};
          const ver = res?.version || res?.latest || res || {};

          this.formName = form?.name || res?.name || 'Formulário';
          this.versionId = ver?.id_form_version ?? ver?.id ?? null;

          const schema = ver?.schema_json || ver?.schema || null;

          this.defaultLang = schema?.default_language || form?.default_language || 'pt-PT';

          // seu schema pode ser { sections:[{elements:[]}] } ou direto {elements:[]}
          const sections = Array.isArray(schema?.sections) ? schema.sections : [];
          if (sections.length > 0) {
            this.elements = (sections[0]?.elements || []) as any[];
          } else {
            this.elements = Array.isArray(schema?.elements) ? schema.elements : [];
          }

          this.loading = false;
        },
        error: async (err) => {
          console.error(err);
          this.loading = false;
          const t = await this.toastCtrl.create({
            message: 'Erro ao carregar formulário.',
            duration: 2500,
            color: 'danger',
          });
          await t.present();
        },
      });
  }

  // ✅ Agora aceita ErrorEvent / qualquer coisa, sem erro de compile
  async onRendererError(err: unknown) {
    console.error('Renderer error:', err);

    let msg = 'Erro ao renderizar formulário.';
    if (typeof err === 'string') msg = err;
    else if (err && typeof err === 'object') {
      // ErrorEvent costuma ter message
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

  // opcional: se você já tem botão salvar em outro lugar, pode ignorar.
  async save() {
    if (!this.submissionId) {
      // Se sua main cria submission antes, mantenha igual.
      // Aqui deixo apenas uma mensagem para não quebrar.
      const t = await this.toastCtrl.create({
        message: 'Nenhuma submissão ativa para salvar.',
        duration: 2200,
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
