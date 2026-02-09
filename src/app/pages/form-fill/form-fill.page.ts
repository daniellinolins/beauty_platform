import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { ApiService } from 'src/app/services/api';

import { FormRendererComponent } from '../../components/form-renderer/form-renderer.component';
import { FormElement } from '../../components/form-renderer/form-renderer.types';


type FormSchema = {
  schema_version: string;
  default_language: string;
  sections: Array<{
    id: string;
    title?: Record<string, string>;
    elements: FormElement[];
  }>;
};

@Component({
  selector: 'app-form-fill',
  standalone: true,
  templateUrl: './form-fill.page.html',
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonText,
    IonSpinner,
    IonButton,
    FormRendererComponent,
  ],
})
export class FormFillPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  tenantId = 1;

  // placeholders atuais (mantendo tua abordagem)
  clinicId = 1;

  // backend exige client_id numérico (não pode ser null)
  clientId: number = 1;

  idForm = 0;
  idFormVersion = 0;

  loading = false;
  errorMsg = '';

  defaultLang = 'pt-PT';
  elements: FormElement[] = [];

  payload: Record<string, any> = {};
  submissionId: number | null = null;

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit() {
    // aceita os dois nomes (id_form e idForm) para evitar quebra por rota
    const p1 = this.route.snapshot.paramMap.get('id_form');
    const p2 = this.route.snapshot.paramMap.get('idForm');
    this.idForm = Number(p1 || p2 || 0);

    this.loadForm();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadForm() {
    this.loading = true;
    this.errorMsg = '';
    this.elements = [];

    try {
      const fv = await firstValueFrom(
        this.api.getLatestFormVersion(this.tenantId, this.idForm).pipe(takeUntil(this.destroy$)),
      );

      this.idFormVersion = Number(fv?.id_form_version || 0);

      const raw = fv?.schema_json;
      if (!raw) {
        this.errorMsg = 'Schema não encontrado.';
        return;
      }

      const parsed: FormSchema = typeof raw === 'string' ? JSON.parse(raw) : raw;

      this.defaultLang = parsed?.default_language || 'pt-PT';

      const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];
      this.elements = sections.reduce<FormElement[]>((acc, s) => {
        const els = Array.isArray(s?.elements) ? s.elements : [];
        return acc.concat(els);
      }, []);

      if (this.elements.length === 0) {
        this.errorMsg = 'Nenhum campo encontrado neste formulário.';
      }
    } catch (e) {
      this.errorMsg = 'Erro ao carregar formulário.';
      console.error(e);
    } finally {
      this.loading = false;
    }
  }

  onRendererError(msg: string) {
    // msg vazio = limpar
    this.errorMsg = msg || '';
  }

  async save() {
    this.errorMsg = '';

    if (!this.idFormVersion) {
      this.errorMsg = 'Versão do formulário inválida.';
      return;
    }

    try {
      if (!this.submissionId) {
        const created = await firstValueFrom(
          this.api
            .createSubmission({
              tenant_id: this.tenantId,
              clinic_id: this.clinicId,
              client_id: this.clientId,
              id_form: this.idForm,
              id_form_version: this.idFormVersion,
            })
            .pipe(takeUntil(this.destroy$)),
        );

        this.submissionId = created?.id_form_submission ?? null;
      }

      if (!this.submissionId) {
        this.errorMsg = 'Não foi possível criar a submissão.';
        return;
      }

      await firstValueFrom(
        this.api
          .saveSubmissionPayload(this.submissionId, this.tenantId, this.payload)
          .pipe(takeUntil(this.destroy$)),
      );

      this.errorMsg = '';
    } catch (e) {
      this.errorMsg = 'Erro ao guardar.';
      console.error(e);
    }
  }
}
