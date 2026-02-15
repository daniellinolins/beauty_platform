import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonicModule, Platform, ToastController } from '@ionic/angular';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { ApiService } from 'src/app/services/api';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-photo-capture',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './photo-capture.component.html',
  styleUrls: ['./photo-capture.component.scss'],
})
export class PhotoCaptureComponent {
  @Input() title = 'Foto';
  @Input() hint = '';

  @Input() disabled: boolean = false;
  @Input() tenantId: number = 1;

  // compat com o files.py (category default do backend é photos)
  @Input() category: 'photos' | 'signatures' | 'pdfs' = 'photos';
  @Input() purpose: string = 'photo';

  /**
   * value esperado no payload:
   * - null
   * - { id_file_object: number }
   * - (opcional) string url
   */
  @Input() value: any = null;
  @Output() valueChange = new EventEmitter<any>();

  uploading = false;
  errMsg: string | null = null;

  previewUrl: string | null = null; // URL local (blob) ou remota (/api/files/:id)
  private localObjectUrl: string | null = null;

  constructor(
    public platform: Platform,
    private api: ApiService,
    private toastCtrl: ToastController,
  ) {}

  ngOnInit() {
    this.syncPreviewFromValue();
  }

  ngOnChanges() {
    this.syncPreviewFromValue();
  }

  private buildFileUrl(idFile: number): string {
    // environment.apiBaseUrl deve ser algo como "http://144.64.115.131:5000"
    // a rota do backend é /api/files/<id>?tenant_id=...
    return `${environment.apiBaseUrl}/api/files/${idFile}?tenant_id=${this.tenantId}`;
  }

  private syncPreviewFromValue() {
    const v = this.value;

    // limpa preview local anterior
    this.revokeLocalUrl();

    if (!v) {
      this.previewUrl = null;
      return;
    }

    if (typeof v === 'string') {
      this.previewUrl = v;
      return;
    }

    if (typeof v === 'object') {
      const id = v?.id_file_object ?? v?.id ?? null;
      const url = v?.url ?? v?.file_url ?? null;

      if (url) {
        this.previewUrl = url;
        return;
      }

      if (id) {
        this.previewUrl = this.buildFileUrl(Number(id));
        return;
      }
    }

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
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      });

      const blob = await this.photoToBlob(photo);

      // ✅ preview imediato (local)
      this.setLocalPreview(blob);

      const filename = this.buildFilename('camera');
      await this.uploadAndStore(blob, filename);
    } catch (e: any) {
      if (String(e?.message || e).toLowerCase().includes('cancel')) return;
      console.error(e);
      this.errMsg = 'Erro ao enviar foto.';
      await this.toast(this.errMsg, 'danger');
    } finally {
      this.uploading = false;
    }
  }

  pickFromGallery() {
    if (this.disabled || this.uploading) return;

    // web -> abre file input
    const input = document.getElementById(this.fileInputId) as HTMLInputElement | null;
    input?.click();
  }

  async onFilePicked(ev: any) {
    if (this.disabled || this.uploading) return;

    const file: File | null = ev?.target?.files?.[0] || null;
    if (!file) return;

    this.errMsg = null;

    try {
      this.uploading = true;

      // ✅ preview imediato (local)
      this.setLocalPreview(file);

      const filename = file.name || this.buildFilename('web');
      await this.uploadAndStore(file, filename);
    } catch (e: any) {
      console.error(e);
      this.errMsg = 'Erro ao enviar foto.';
      await this.toast(this.errMsg, 'danger');
    } finally {
      this.uploading = false;
      try { ev.target.value = ''; } catch {}
    }
  }

  remove() {
    if (this.disabled || this.uploading) return;

    this.errMsg = null;
    this.value = null;
    this.valueChange.emit(null);

    this.revokeLocalUrl();
    this.previewUrl = null;
  }

  private async uploadAndStore(blobOrFile: Blob, filename: string) {
    const resp: any = await this.api
      .uploadFile(this.tenantId, blobOrFile, filename, this.category, this.purpose)
      .toPromise();

    // files.py retorna id_file_object, storage_path, etc.
    const id = resp?.id_file_object ?? resp?.id ?? null;
    if (!id) {
      // upload pode ter gravado, mas retorno não veio certo
      throw new Error('Upload sem id_file_object no retorno.');
    }

    // ✅ salva payload leve
    this.value = { id_file_object: Number(id) };
    this.valueChange.emit(this.value);

    // ✅ preview remoto usando rota GET do backend
    this.revokeLocalUrl();
    this.previewUrl = this.buildFileUrl(Number(id));
  }

  private async photoToBlob(photo: Photo): Promise<Blob> {
    const webPath = photo.webPath;
    if (!webPath) throw new Error('Camera photo has no webPath');
    const res = await fetch(webPath);
    return await res.blob();
  }

  private setLocalPreview(blobOrFile: Blob) {
    this.revokeLocalUrl();
    try {
      this.localObjectUrl = URL.createObjectURL(blobOrFile);
      this.previewUrl = this.localObjectUrl;
    } catch {
      // sem preview local
    }
  }

  private revokeLocalUrl() {
    if (this.localObjectUrl) {
      try { URL.revokeObjectURL(this.localObjectUrl); } catch {}
      this.localObjectUrl = null;
    }
  }

  private buildFilename(source: string): string {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return `photo_${this.purpose}_${source}_${ts}.jpg`;
  }

  private async toast(message: string, color: 'success' | 'warning' | 'danger' | 'primary' = 'primary') {
    const t = await this.toastCtrl.create({ message, duration: 2200, color });
    await t.present();
  }
}
