import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Optional, Output } from '@angular/core';
import { IonicModule, ModalController, Platform, ToastController } from '@ionic/angular';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { ApiService } from 'src/app/services/api';

export type PhotoCaptureResult =
  | { ok: true; id_file_object?: number; url?: string; mime_type?: string }
  | { ok: false; error?: string };

/**
 * Inline photo capture component (mobile-first).
 *
 * - Hybrid: uses Capacitor Camera
 * - Web: uses file input (and can also use Capacitor Photos on hybrid)
 *
 * It uploads the image to backend (/api/files) and stores a JSON-friendly
 * reference (url or {id_file_object,url}) into `value`.
 */
@Component({
  selector: 'app-photo-capture',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './photo-capture.component.html',
  styleUrls: ['./photo-capture.component.scss'],
})
export class PhotoCaptureComponent {
  // Optional labels (kept for backward compatibility)
  @Input() title = 'Foto';
  @Input() hint = '';

  // Renderer compatibility
  @Input() disabled: boolean = false;
  @Input() tenantId: number = 1;

  /** Category/purpose used by /api/files */
  @Input() category: string = 'FORM_SUBMISSION';
  @Input() purpose: string = 'photo';

  /** Stored value (JSON friendly): url string, id number, or object {id_file_object,url} */
  @Input() value: any = null;
  @Output() valueChange = new EventEmitter<any>();

  // Optional legacy outputs (if used as modal somewhere)
  @Output() done = new EventEmitter<PhotoCaptureResult>();
  @Output() cancelled = new EventEmitter<void>();

  previewUrl: string | null = null;
  uploading = false;
  errMsg: string | null = null;

  constructor(
    public platform: Platform,
    private api: ApiService,
    private toastCtrl: ToastController,
    @Optional() private modalCtrl?: ModalController
  ) {}

  ngOnInit() {
    this.syncPreviewFromValue();
  }

  ngOnChanges() {
    this.syncPreviewFromValue();
  }

  private syncPreviewFromValue() {
    const v: any = this.value;
    if (!v) {
      this.previewUrl = null;
      return;
    }
    if (typeof v === 'string') {
      this.previewUrl = v;
      return;
    }
    if (typeof v === 'object') {
      this.previewUrl = v.url || v.file_url || v.public_url || v.path || null;
      return;
    }
    // number id: no url known
    this.previewUrl = null;
  }

  get hasValue(): boolean {
    return !!this.value;
  }

  get fileInputId(): string {
    return `pc_file_${this.purpose}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
  }

  async captureFromCamera() {
    if (this.disabled || this.uploading) return;

    this.errMsg = null;

    try {
      this.uploading = true;

      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      });

      const blob = await this.photoToBlob(photo);
      const filename = this.buildFilename('camera');

      await this.uploadAndSetValue(blob, filename);
    } catch (e: any) {
      if (String(e?.message || e).toLowerCase().includes('cancel')) return;
      console.error(e);
      this.errMsg = 'Erro ao capturar/enviar foto.';
      await this.toast(this.errMsg, 'danger');
    } finally {
      this.uploading = false;
    }
  }

  async pickFromGallery() {
    if (this.disabled || this.uploading) return;

    this.errMsg = null;

    // Web: open file picker
    if (!this.platform.is('hybrid')) {
      const input = document.getElementById(this.fileInputId) as HTMLInputElement | null;
      input?.click();
      return;
    }

    // Hybrid: open Photos
    try {
      this.uploading = true;

      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos,
      });

      const blob = await this.photoToBlob(photo);
      const filename = this.buildFilename('gallery');

      await this.uploadAndSetValue(blob, filename);
    } catch (e: any) {
      if (String(e?.message || e).toLowerCase().includes('cancel')) return;
      console.error(e);
      this.errMsg = 'Erro ao selecionar/enviar foto.';
      await this.toast(this.errMsg, 'danger');
    } finally {
      this.uploading = false;
    }
  }

  async onFilePicked(ev: any) {
    if (this.disabled || this.uploading) return;

    this.errMsg = null;

    const file: File | null = ev?.target?.files?.[0] || null;
    if (!file) return;

    try {
      this.uploading = true;
      const filename = file.name || this.buildFilename('web');
      await this.uploadAndSetValue(file, filename);
    } catch (e: any) {
      console.error(e);
      this.errMsg = 'Erro ao enviar foto.';
      await this.toast(this.errMsg, 'danger');
    } finally {
      this.uploading = false;
      try {
        ev.target.value = '';
      } catch {}
    }
  }

  remove() {
    if (this.disabled || this.uploading) return;

    this.errMsg = null;
    this.value = null;
    this.previewUrl = null;
    this.valueChange.emit(null);

    const result: PhotoCaptureResult = { ok: false, error: 'removed' };
    this.done.emit(result);
  }

  async cancel() {
    this.cancelled.emit();
    if (this.modalCtrl) {
      await this.modalCtrl.dismiss(null, 'cancel');
    }
  }

  private async photoToBlob(photo: Photo): Promise<Blob> {
    const webPath = photo.webPath;
    if (!webPath) throw new Error('Camera photo has no webPath');
    const res = await fetch(webPath);
    return await res.blob();
  }

  private buildFilename(source: string): string {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return `photo_${this.purpose}_${source}_${ts}.jpg`;
  }

  private async uploadAndSetValue(blobOrFile: Blob, filename: string) {
    const resp: any = await this.api
      .uploadFile(this.tenantId, blobOrFile, filename, this.category, this.purpose)
      .toPromise();

    // Normalize response flexibly
    const out: any = {};
    if (typeof resp === 'string') {
      out.url = resp;
    } else {
      out.id_file_object = resp?.id_file_object ?? resp?.id ?? resp?.file_id ?? resp?.id_file ?? null;
      out.url = resp?.url ?? resp?.file_url ?? resp?.public_url ?? resp?.path ?? null;
      out._raw = resp;
    }

    // Save JSON-friendly value to payload
    const valueToStore =
      out.url ? out.url : out.id_file_object ? { id_file_object: out.id_file_object, url: out.url } : out;

    this.value = valueToStore;
    this.previewUrl = out.url || this.previewUrl;

    this.valueChange.emit(this.value);

    const result: PhotoCaptureResult = {
      ok: true,
      id_file_object: out.id_file_object ?? undefined,
      url: out.url ?? undefined,
      mime_type: (blobOrFile as any)?.type || undefined,
    };
    this.done.emit(result);

    if (this.modalCtrl) {
      await this.modalCtrl.dismiss(result, 'done');
    }
  }

  private async toast(message: string, color: 'success' | 'warning' | 'danger' | 'primary' = 'primary') {
    const t = await this.toastCtrl.create({ message, duration: 2200, color });
    await t.present();
  }
}
