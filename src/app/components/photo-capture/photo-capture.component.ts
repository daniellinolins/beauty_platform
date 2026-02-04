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

  @Output() done = new EventEmitter<PhotoCaptureResult>();
  @Output() cancelled = new EventEmitter<void>();

  // precisa ser public pra usar no template
  constructor(
    public platform: Platform,
    @Optional() private modalCtrl?: ModalController
  ) {}

  previewUrl: string | null = null;
  blob: Blob | null = null;
  mimeType = 'image/jpeg';
  errMsg: string | null = null;

  async takePhoto() {
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
      // usuário pode cancelar a câmera
      if (String(e?.message || e).toLowerCase().includes('cancel')) {
        return;
      }
      this.errMsg = e?.message || 'Erro ao abrir a câmera.';
    }
  }

  async onFilePicked(ev: Event) {
    this.errMsg = null;

    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.blob = file;
    this.mimeType = file.type || 'image/jpeg';

    // preview no browser
    this.previewUrl = URL.createObjectURL(file);
  }

  clear() {
    this.errMsg = null;
    this.blob = null;
    if (this.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(this.previewUrl);
    }
    this.previewUrl = null;
  }

  cancel() {
    this.clear();
    this.cancelled.emit();
    this.modalCtrl?.dismiss(null, 'cancel');
  }

  save() {
    if (!this.blob) {
      this.errMsg = 'Nenhuma foto selecionada.';
      return;
    }

    const result: PhotoCaptureResult = {
      ok: true,
      blob: this.blob,
      mime_type: this.mimeType || 'image/jpeg',
    };

    this.done.emit(result);
    this.modalCtrl?.dismiss(result, 'ok');
  }
}
