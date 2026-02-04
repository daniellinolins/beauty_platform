import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonModal,
  IonSpinner,
  IonText,
  IonTitle,
  IonToggle,
  IonToolbar,
  IonTextarea,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { ApiService } from 'src/app/services/api';

import { SignaturePadComponent } from '../../components/signature-pad/signature-pad.component';

type LocalizedText = Record<string, string>;

type FormField = {
  key: string;
  label?: LocalizedText;
  input_type:
    | 'TEXT'
    | 'TEXTAREA'
    | 'NUMBER'
    | 'DATE'
    | 'BOOL'
    | 'SINGLE_CHOICE'
    | 'PHOTO'
    | 'SIGNATURE';
  required?: boolean;
  options?: Array<{ value: string; label?: LocalizedText }>;
  multiple?: boolean;
  photo_purpose?: string;
};

type FormElement =
  | { type: 'TITLE' | 'SUBTITLE' | 'TEXT_BLOCK'; text: LocalizedText }
  | { type: 'DIVIDER' }
  | { type: 'FIELD'; field: FormField };

type FormSchema = {
  schema_version: string;
  default_language: string;
  sections: Array<{
    id: string;
    title?: LocalizedText;
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
    IonItem,
    IonLabel,
    IonInput,
    IonTextarea,
    IonToggle,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonModal,
    SignaturePadComponent,
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

  // --- Assinatura ---
  @ViewChild('signatureModal', { static: false }) signatureModal?: IonModal;
  @ViewChild('sigPad') sigPad?: SignaturePadComponent;

  signatureFieldKey: string | null = null;

  signaturePadOptions: any = {
    penColor: '#000',
    lineWidth: 2,
    backgroundColor: '#fff',
    minWidth: 1,
    maxWidth: 2.5,
  };

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

  getTextLocalized(txt?: LocalizedText): string {
    if (!txt) return '';
    return (
      txt[this.defaultLang] ||
      txt['pt-PT'] ||
      txt['pt-BR'] ||
      txt['en-US'] ||
      Object.values(txt)[0] ||
      ''
    );
  }

  getPayloadValue(key?: string): any {
    if (!key) return null;
    return this.payload[key];
  }

  setPayloadValue(key?: string, value?: any) {
    if (!key) return;
    this.payload[key] = value;
  }

  onSignatureModalDidPresent() {
    this.sigPad?.resizeCanvas();
  }

  async openSignature(fieldKey: string) {
    this.errorMsg = '';
    this.signatureFieldKey = fieldKey;

    await this.signatureModal?.present();

    setTimeout(() => {
      try {
        this.sigPad?.resizeCanvas();
        this.sigPad?.clear();
      } catch (e) {
        console.error('SignaturePad resize/clear failed', e);
      }
    }, 80);
  }

  clearSignature() {
    try {
      this.sigPad?.clear();
    } catch {}
  }

  async saveSignatureToPayload() {
    if (!this.signatureFieldKey) return;

    const isEmpty = this.sigPad?.isEmpty?.() === true;
    if (isEmpty) {
      this.errorMsg = 'Assine antes de guardar.';
      return;
    }

    const dataUrl: string | undefined = this.sigPad?.toDataURL?.('image/png');
    if (!dataUrl) {
      this.errorMsg = 'Não foi possível capturar a assinatura.';
      return;
    }

    const file = this.dataUrlToFile(dataUrl, `signature_${Date.now()}.png`);

    try {
      const uploaded = await firstValueFrom(
        this.api
          .uploadFile(this.tenantId, file, file.name, 'signatures', 'SIGNATURE')
          .pipe(takeUntil(this.destroy$)),
      );

      // ✅ backend retorna id_file_object (não id_file)
      const fileObjectId = uploaded?.id_file_object;
      if (!fileObjectId) {
        this.errorMsg = 'Upload da assinatura falhou (id_file_object vazio).';
        console.error('Upload response:', uploaded);
        return;
      }

      // salva no payload
      this.setPayloadValue(this.signatureFieldKey, {
        id_file_object: fileObjectId,
        kind: 'SIGNATURE',
      });

      await this.signatureModal?.dismiss();
      this.signatureFieldKey = null;
      this.errorMsg = '';
    } catch (e) {
      this.errorMsg = 'Erro ao enviar assinatura.';
      console.error(e);
    }
  }

  private dataUrlToFile(dataUrl: string, filename: string): File {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, { type: mime });
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
