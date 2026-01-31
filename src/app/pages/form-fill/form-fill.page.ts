import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonText,
  IonSpinner,
  IonButton,
  IonItem,
  IonLabel,
  IonInput,
  IonTextarea,
  IonDatetime,
  IonToggle,
  IonSelect,
  IonSelectOption,
  IonCard,
  IonCardContent,
} from '@ionic/angular/standalone';

import { ApiService } from '../../services/api';

import { ModalController } from '@ionic/angular';
import { SignaturePadComponent } from '../../components/signature-pad/signature-pad.component';

@Component({
  selector: 'app-form-fill',
  templateUrl: './form-fill.page.html',
  styleUrls: ['./form-fill.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonText,
    IonSpinner,
    IonButton,
    IonItem,
    IonLabel,
    IonInput,
    IonTextarea,
    IonDatetime,
    IonToggle,
    IonSelect,
    IonSelectOption,
    IonCard,
    IonCardContent,
  ],
})
export class FormFillPage implements OnInit {
  // Contexto fixo (por enquanto)
  tenantId = 1;
  clinicId = 1;
  clientId = 1;

  idForm!: number;

  // Loading do schema do formulário
  loading = true;

  // Loading de operações de persistência
  saving = false;

  errorMsg: string | null = null;

  formVersion: any = null;
  elements: any[] = [];

  // ✅ agora só é criado no 1º Save
  submissionId: number | null = null;

  // Debug opcional
  debug = true;
  schemaRawType: string | null = null;

  payload: Record<string, any> = {};

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    private modalCtrl: ModalController,
  ) {}

  ngOnInit() {
    this.idForm = Number(this.route.snapshot.paramMap.get('id_form'));
    this.loadSchemaOnly();
  }

  /**
   * ✅ Carrega apenas o schema (não cria submission)
   */
  loadSchemaOnly() {
    this.loading = true;
    this.errorMsg = null;
    this.elements = [];
    this.formVersion = null;

    this.api.getLatestFormVersion(this.tenantId, this.idForm).subscribe({
      next: (fv) => {
        const s = String(fv.schema_json);
        console.log('[DEBUG] char around error:', s.slice(1560, 1630));

        console.log('[DEBUG] schema_json typeof:', typeof fv.schema_json);
        console.log(
          '[DEBUG] schema_json preview:',
          String(fv.schema_json).slice(0, 250),
        );

        try {
          const parsed = JSON.parse(fv.schema_json);
          console.log('[DEBUG] parsed keys:', Object.keys(parsed));
          console.log(
            '[DEBUG] parsed.sections length:',
            parsed?.sections?.length,
          );
          console.log(
            '[DEBUG] first type:',
            parsed?.sections?.[0]?.elements?.[0]?.type,
          );
        } catch (e) {
          console.log('[DEBUG] JSON.parse failed:', e);
        }

        this.formVersion = fv;

        this.schemaRawType = typeof fv?.schema_json;

        const schemaObj = this.normalizeSchema(fv?.schema_json);
        this.elements = this.flattenElements(schemaObj);

        if (this.debug) {
          // eslint-disable-next-line no-console
          console.log('[FormFill] schema_json typeof:', this.schemaRawType);
          // eslint-disable-next-line no-console
          console.log('[FormFill] elements count:', this.elements.length);
          // eslint-disable-next-line no-console
          console.log('[FormFill] first elements:', this.elements.slice(0, 5));
        }

        this.loading = false;
      },
      error: (err) => {
        this.errorMsg =
          err?.error?.message ||
          err?.message ||
          'Erro ao carregar versão do formulário';
        this.loading = false;
      },
    });
  }

  /**
   * Se vier string JSON, faz parse.
   */
  private normalizeSchema(schemaAny: any): any | null {
    if (schemaAny == null) return null;

    // tentativa 1
    if (typeof schemaAny === 'string') {
      try {
        const parsed1 = JSON.parse(schemaAny);

        // se ainda for string, tenta de novo (double-encoded)
        if (typeof parsed1 === 'string') {
          try {
            return JSON.parse(parsed1);
          } catch {
            return parsed1; // já é string “conteúdo”
          }
        }

        return parsed1;
      } catch (e) {
        if (this.debug)
          console.error('[FormFill] Failed to parse schema_json string:', e);
        return null;
      }
    }

    return schemaAny;
  }

  /**
   * Extrai elements do schema no formato:
   * schema.sections[].elements[]
   */
  private flattenElements(schemaAny: any): any[] {
    const schema = this.normalizeSchema(schemaAny);
    if (!schema) return [];

    const root = schema?.schema_json
      ? this.normalizeSchema(schema.schema_json)
      : schema;

    const sections = root?.sections;
    if (Array.isArray(sections)) {
      const out: any[] = [];
      for (const s of sections) {
        const els = s?.elements;
        if (Array.isArray(els)) out.push(...els);
      }
      return out;
    }

    if (Array.isArray(root?.elements)) return root.elements;

    return [];
  }

  getTextLocalized(obj: any): string {
    if (!obj) return '';
    return obj['pt-PT'] || obj['pt'] || obj['en-US'] || '';
  }

  trackByIndex(i: number) {
    return i;
  }

  updateField(key: string, value: any) {
    this.payload[key] = value;
  }

  /**
   * ✅ Primeiro Save:
   * 1) cria submission
   * 2) salva payload
   *
   * Próximos Saves:
   * - só salva payload
   */
  async save() {
    this.errorMsg = null;

    // sem schema carregado, não tem o que salvar
    if (!this.formVersion?.id_form_version) {
      this.errorMsg =
        'Formulário ainda não carregou corretamente (sem versão).';
      return;
    }

    if (this.saving) return;

    this.saving = true;

    try {
      // 1) Se ainda não existe submission, cria agora (primeiro save)
      if (!this.submissionId) {
        const req = {
          tenant_id: this.tenantId,
          clinic_id: this.clinicId,
          client_id: this.clientId,
          id_form: this.idForm,
          id_form_version: this.formVersion.id_form_version,
        };

        const sub = await this.api.createSubmission(req).toPromise();
        this.submissionId = sub?.id_form_submission;

        if (!this.submissionId) {
          throw new Error(
            'Falha ao criar submission (id_form_submission não retornou).',
          );
        }
      }

      // 2) Salva payload
      await this.api
        .saveSubmissionPayload(this.submissionId, this.tenantId, this.payload)
        .toPromise();
    } catch (err: any) {
      this.errorMsg = err?.error?.message || err?.message || 'Erro ao salvar';
    } finally {
      this.saving = false;
    }
  }

  /**
   * Botão salvar habilita mesmo sem submission:
   * ✅ porque o 1º clique cria a submission
   */
  canSave(): boolean {
    return (
      !this.loading &&
      this.elements.length > 0 &&
      !this.saving &&
      !this.errorMsg
    );
  }

  async captureSignature(fieldKey: string) {
    const tenantId = this.tenantId;
    const clinicId = this.clinicId;
    const clientId = this.clientId;

    const modal = await this.modalCtrl.create({
      component: SignaturePadComponent,
      componentProps: {
        title: 'Assinatura do Cliente',
        hint: 'Assine com o dedo ou caneta. Depois toque em Guardar.',
      },
    });

    await modal.present();
    const { data } = await modal.onDidDismiss();

    if (!data?.ok || !data?.blob) {
      return;
    }

    // 1) upload no backend
    const filename = `signature_${clientId}_${Date.now()}.png`;

    try {
      const resp = await this.api
        .uploadFile(tenantId, data.blob, filename, 'signatures', 'SIGNATURE')
        .toPromise();

      // 2) gravar no payload
      this.payload[fieldKey] = {
        file_id: resp.id_file_object,
        type: 'SIGNATURE',
      };

      // 3) montar o signature_meta (modelo auditável)
      this.payload['consent.signature_meta'] = {
        signed_at: resp.signed_at_utc,
        device: navigator.userAgent,
        ip: resp.ip,
        app_version: '0.1.0',
        clinic_id: clinicId,
        client_id: clientId,
        tenant_id: tenantId,
        file_sha256: resp.sha256,
      };
    } catch (e: any) {
      console.error(e);
    }
  }
}
