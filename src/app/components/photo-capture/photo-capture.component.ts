import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  Optional,
  Output,
} from '@angular/core';
import { IonicModule, ModalController, Platform } from '@ionic/angular';
import {
  Camera,
  CameraResultType,
  CameraSource,
} from '@capacitor/camera';

export type PhotoCaptureResult =
  | { ok: true; blob: Blob; mime_type: string }
  | { ok: false; error?: string };

@Component({
  selector: 'app-photo-capture',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './photo-capture.component.html',
  styleUrls: ['./photo-capture.component.scss'],
})
export class PhotoCaptureComponent {
  @Input() title = 'Capturar foto';
  @Input() hint = 'Tire uma foto nítida.';

  // ✅ Compat p/ uso embutido no renderer (não quebra o uso modal atual)
  @Input() disabled: boolean = false;
  @Input() tenantId: number = 1;
  @Input() value: any = null;
  @Output() valueChange = new EventEmitter<any>();

  @Output() done = new EventEmitter<PhotoCaptureResult>();
  @Output() cancelled = new EventEmitter<void>();

  constructor(
    public platform: Platform,
    @Optional() private modalCtrl?: ModalController
  ) {}

  previewUrl: string | null = null;
  blob: Blob | null = null;
  mimeType = 'image/jpeg';
  errMsg: string | null = null;

  async takePhoto() {
    if (this.disabled) return;

    this.errMsg = null;

    try {
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      });

      const webPath = photo.webPath;
      if (!webPath) {
        this.errMsg = 'Não foi possível obter a foto.';
        return;
      }

      const res = await fetch(webPath);
      const blob = await res.blob();

      this.blob = blob;
      this.mimeType = blob.type || 'image/jpeg';
      this.previewUrl = webPath;
    } catch (e: any) {
      if (String(e?.message || e).toLowerCase().includes('cancel')) return;
      this.errMsg = 'Erro ao capturar foto.';
      console.error(e);
    }
  }

  async onFilePicked(ev: any) {
    if (this.disabled) return;

    this.errMsg = null;
    const file: File | null = ev?.target?.files?.[0] || null;
    if (!file) return;

    this.blob = file;
    this.mimeType = file.type || 'image/jpeg';
    this.previewUrl = URL.createObjectURL(file);
  }

  clear() {
    if (this.disabled) return;

    this.errMsg = null;
    this.blob = null;

    if (this.previewUrl && this.previewUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(this.previewUrl);
      } catch {}
    }
    this.previewUrl = null;

    // compat renderer
    this.value = null;
    this.valueChange.emit(null);
  }

  async save() {
    if (this.disabled) return;

    if (!this.blob) {
      this.errMsg = 'Nenhuma imagem selecionada.';
      return;
    }

    const result: PhotoCaptureResult = { ok: true, blob: this.blob, mime_type: this.mimeType };

    // ✅ compat renderer: emite também valueChange
    this.value = result;
    this.valueChange.emit(result);

    this.done.emit(result);

    if (this.modalCtrl) {
      await this.modalCtrl.dismiss(result, 'done');
    }
  }

  async cancel() {
    this.cancelled.emit();

    if (this.modalCtrl) {
      await this.modalCtrl.dismiss(null, 'cancel');
    }
  }
}
