import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import {
  IonButton,
  IonItem,
  IonLabel,
  IonInput,
  IonTextarea,
  IonToggle,
  IonSelect,
  IonSelectOption,
  IonModal,
  IonText,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonContent,
} from '@ionic/angular/standalone';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { ApiService } from 'src/app/services/api';

import { SignaturePadComponent } from '../signature-pad/signature-pad.component';

// ✅ Capacitor Camera
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';

import { FormElement, LocalizedText, FieldOption } from './form-renderer.types';

@Component({
  selector: 'app-form-renderer',
  standalone: true,
  templateUrl: './form-renderer.component.html',
  imports: [
    CommonModule,
    IonItem,
    IonLabel,
    IonInput,
    IonTextarea,
    IonToggle,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonModal,
    IonText,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
    SignaturePadComponent,
  ],
})
export class FormRendererComponent implements OnDestroy {
  private destroy$ = new Subject<void>();

  @Input() mode: 'edit' | 'preview' = 'edit';
  @Input() tenantId: number = 1;
  @Input() defaultLang: string = 'pt-PT';
  @Input() elements: FormElement[] = [];
  @Input() payload: Record<string, any> = {};

  @Output() error = new EventEmitter<string>();

  private photoPreviewUrls: Record<string, string> = {};

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

  constructor(private api: ApiService) {}

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    for (const k of Object.keys(this.photoPreviewUrls)) {
      try {
        URL.revokeObjectURL(this.photoPreviewUrls[k]);
      } catch {}
    }
  }

  // -------------------------
  // Helpers: no template casting
  // -------------------------
  isTitle(e: FormElement): boolean {
    return e.type === 'TITLE';
  }
  isSubtitle(e: FormElement): boolean {
    return e.type === 'SUBTITLE';
  }
  isTextBlock(e: FormElement): boolean {
    return e.type === 'TEXT_BLOCK';
  }
  isDivider(e: FormElement): boolean {
    return e.type === 'DIVIDER';
  }
  isField(e: FormElement): boolean {
    return e.type === 'FIELD';
  }

  getStaticText(e: FormElement): LocalizedText | null {
    if (e.type === 'TITLE' || e.type === 'SUBTITLE' || e.type === 'TEXT_BLOCK') {
      return (e as any).text || null;
    }
    return null;
  }

  getKey(e: FormElement): string {
    if (e.type !== 'FIELD') return '';
    return (e as any).key || '';
  }

  getInputType(e: FormElement): string {
    if (e.type !== 'FIELD') return '';
    return (e as any).input_type || '';
  }

  getLabel(e: FormElement): LocalizedText | null {
    if (e.type !== 'FIELD') return null;
    return (e as any).label || null;
  }

  getPlaceholder(e: FormElement): LocalizedText | null {
    if (e.type !== 'FIELD') return null;
    return (e as any).placeholder || null;
  }

  getOptions(e: FormElement): FieldOption[] {
    if (e.type !== 'FIELD') return [];
    return (e as any).options || [];
  }

  getPhotoPurpose(e: FormElement): string {
    if (e.type !== 'FIELD') return '';
    return (e as any).photo_purpose || '';
  }

  // -------------------------
  // Utils / Localization
  // -------------------------
  getTextLocalized(txt?: LocalizedText | null): string {
    if (!txt) return '';
    return (
      txt[this.defaultLang] ||
      txt['pt-PT'] ||
      txt['pt-BR'] ||
      txt['en-US'] ||
      (Object.values(txt).length > 0 ? Object.values(txt)[0] : '') ||
      ''
    );
  }

  canEdit(): boolean {
    return this.mode === 'edit';
  }

  getPayloadValue(key?: string): any {
    if (!key) return null;
    return this.payload[key];
  }

  setPayloadValue(key?: string, value?: any) {
    if (!key) return;
    this.payload[key] = value;
  }

  // -------------------------
  // PHOTO
  // -------------------------
  getPhotoPreview(fieldKey: string): string | null {
    return this.photoPreviewUrls[fieldKey] || null;
  }

  private setPhotoPreview(fieldKey: string, url: string) {
    const old = this.photoPreviewUrls[fieldKey];
    if (old) {
      try {
        URL.revokeObjectURL(old);
      } catch {}
    }
    this.photoPreviewUrls[fieldKey] = url;
  }

  removePhoto(fieldKey: string) {
    if (!this.canEdit()) return;

    const old = this.photoPreviewUrls[fieldKey];
    if (old) {
      try {
        URL.revokeObjectURL(old);
      } catch {}
      delete this.photoPreviewUrls[fieldKey];
    }

    const current = this.getPayloadValue(fieldKey);
    if (current) delete this.payload[fieldKey];
  }

  async capturePhoto(fieldKey: string, purpose?: string) {
    if (!this.canEdit()) return;

    this.emitError('');

    try {
      const photo: Photo = await Camera.getPhoto({
        quality: 85,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        allowEditing: false,
        saveToGallery: false,
      });

      const webPath = photo.webPath;
      if (!webPath) {
        this.emitError('Não foi possível obter o caminho da foto.');
        return;
      }

      const blob = await this.fetchAsBlob(webPath);
      const ext = this.guessExtension(photo.format);
      const filename = `photo_${Date.now()}.${ext}`;
      const file = new File([blob], filename, {
        type: blob.type || `image/${ext}`,
      });

      this.setPhotoPreview(fieldKey, URL.createObjectURL(file));

      const uploaded = await firstValueFrom(
        this.api
          .uploadFile(this.tenantId, file, file.name, 'photos', purpose || 'PHOTO')
          .pipe(takeUntil(this.destroy$)),
      );

      const fileObjectId = uploaded?.id_file_object;
      if (!fileObjectId) {
        this.emitError('Upload da foto falhou (id_file_object vazio).');
        console.error('Upload response:', uploaded);
        return;
      }

      this.setPayloadValue(fieldKey, {
        id_file_object: fileObjectId,
        kind: 'PHOTO',
        purpose: purpose || 'PHOTO',
      });

      this.emitError('');
    } catch (e) {
      this.emitError('Erro ao capturar/enviar foto.');
      console.error(e);
    }
  }

  private async fetchAsBlob(url: string): Promise<Blob> {
    const res = await fetch(url);
    return await res.blob();
  }

  private guessExtension(format?: string): string {
    const f = (format || '').toLowerCase();
    if (f === 'png') return 'png';
    if (f === 'jpeg' || f === 'jpg') return 'jpg';
    if (f === 'heic') return 'heic';
    return 'jpg';
  }

  // -------------------------
  // SIGNATURE
  // -------------------------
  async openSignature(fieldKey: string) {
    if (!this.canEdit()) return;

    this.signatureFieldKey = fieldKey;
    await this.signatureModal?.present();
  }

  clearSignature() {
    if (!this.canEdit()) return;

    try {
      this.sigPad?.clear?.();
    } catch {}
  }

  async saveSignatureToPayload() {
    if (!this.canEdit()) return;
    if (!this.signatureFieldKey) return;

    const isEmpty = this.sigPad?.isEmpty?.() === true;
    if (isEmpty) {
      this.emitError('Assine antes de guardar.');
      return;
    }

    const dataUrl: string | undefined = this.sigPad?.toDataURL?.('image/png');
    if (!dataUrl) {
      this.emitError('Não foi possível capturar a assinatura.');
      return;
    }

    const file = this.dataUrlToFile(dataUrl, `signature_${Date.now()}.png`);

    try {
      const uploaded = await firstValueFrom(
        this.api
          .uploadFile(this.tenantId, file, file.name, 'signatures', 'SIGNATURE')
          .pipe(takeUntil(this.destroy$)),
      );

      const fileObjectId = uploaded?.id_file_object;
      if (!fileObjectId) {
        this.emitError('Upload da assinatura falhou (id_file_object vazio).');
        console.error('Upload response:', uploaded);
        return;
      }

      this.setPayloadValue(this.signatureFieldKey, {
        id_file_object: fileObjectId,
        kind: 'SIGNATURE',
      });

      await this.signatureModal?.dismiss();
      this.signatureFieldKey = null;

      this.emitError('');
    } catch (e) {
      this.emitError('Erro ao enviar assinatura.');
      console.error(e);
    }
  }

  private dataUrlToFile(dataUrl: string, filename: string): File {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bstr = atob(arr[arr.length - 1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, { type: mime });
  }

  // -------------------------
  // Error channel
  // -------------------------
  private emitError(msg: string) {
    this.error.emit(msg);
  }
}
