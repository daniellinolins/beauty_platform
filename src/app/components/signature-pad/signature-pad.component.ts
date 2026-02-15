import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ApiService } from 'src/app/services/api';
import { IonicModule, ToastController } from '@ionic/angular';
import { environment } from '../../../environments/environment';

export type SignaturePadOptions = {
  penColor?: string;
  lineWidth?: number;
  backgroundColor?: string;
  minWidth?: number;
  maxWidth?: number;
};

@Component({
  selector: 'signature-pad, app-signature-pad',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './signature-pad.component.html',
  styleUrls: ['./signature-pad.component.scss'],
})
export class SignaturePadComponent implements AfterViewInit, AfterViewChecked {
  // ✅ static false pois o canvas está dentro de *ngIf
  @ViewChild('canvas', { static: false }) canvasRef?: ElementRef<HTMLCanvasElement>;

  @Input() options: SignaturePadOptions = {
    penColor: '#000',
    lineWidth: 2,
    backgroundColor: '#fff',
  };

  @Input() disabled: boolean = false;
  @Input() tenantId: number = 1;

  @Input() category: 'signatures' | 'photos' | 'pdfs' = 'signatures';
  @Input() purpose: string = 'signature';

  @Input() value: any = null;
  @Output() valueChange = new EventEmitter<any>();

  uploading = false;
  previewUrl: string | null = null;
  showCanvas = true;

  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private empty = true;
  private last: { x: number; y: number } | null = null;

  private canvasInitialized = false;

  constructor(private api: ApiService, private toastCtrl: ToastController) {}

  ngAfterViewInit(): void {
    // Não inicializa aqui cegamente — o canvas pode não existir por causa do *ngIf
    this.syncFromValue();
    this.tryInitCanvasIfVisible();
  }

  ngAfterViewChecked(): void {
    // Garante que após mudanças (ex.: showCanvas toggled) o canvas seja inicializado
    this.tryInitCanvasIfVisible();
  }

  ngOnChanges(): void {
    this.syncFromValue();
    // se showCanvas virar true, AfterViewChecked vai init
  }

  private buildFileUrl(idFile: number): string {
    return `${environment.apiBaseUrl}/api/files/${idFile}?tenant_id=${this.tenantId}`;
  }

  private syncFromValue() {
    const v = this.value as any;

    if (!v) {
      this.previewUrl = null;
      this.showCanvas = true;
      // quando canvas aparecer, ele será init
      return;
    }

    if (typeof v === 'string') {
      this.previewUrl = v;
      this.showCanvas = false;
      return;
    }

    if (typeof v === 'object') {
      const id = v?.id_file_object ?? v?.id ?? null;
      const url = v?.url ?? v?.file_url ?? null;
      if (url) {
        this.previewUrl = url;
        this.showCanvas = false;
        return;
      }
      if (id) {
        this.previewUrl = this.buildFileUrl(Number(id));
        this.showCanvas = false;
        return;
      }
    }

    this.previewUrl = null;
    this.showCanvas = true;
  }

  private tryInitCanvasIfVisible() {
    if (!this.showCanvas) return;
    if (this.canvasInitialized) return;
    if (!this.canvasRef?.nativeElement) return;

    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    this.ctx = ctx;
    this.canvasInitialized = true;

    // Inicializa tamanho/estilo
    this.resizeCanvas();
    this.applyStyle();
    this.clearCanvas(); // garante fundo branco e empty true
  }

  private getCanvas(): HTMLCanvasElement | null {
    return this.canvasRef?.nativeElement ?? null;
  }

  private ensureCtx(): CanvasRenderingContext2D | null {
    if (this.ctx) return this.ctx;
    this.tryInitCanvasIfVisible();
    return this.ctx;
  }

  resizeCanvas(): void {
    const canvas = this.getCanvas();
    const ctx = this.ensureCtx();
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redrawBackground();
  }

  clearCanvas(): void {
    if (this.disabled || this.uploading) return;

    const canvas = this.getCanvas();
    const ctx = this.ensureCtx();
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.redrawBackground();
    this.empty = true;
    this.last = null;
  }

  resetValue(): void {
    if (this.disabled || this.uploading) return;

    this.value = null;
    this.valueChange.emit(null);

    this.previewUrl = null;
    this.showCanvas = true;

    // permite reinicializar caso canvas não estivesse montado antes
    this.canvasInitialized = false;
    this.ctx = null;

    // próxima detecção de view vai init e limpar
  }

  async saveSignature(): Promise<void> {
    if (this.disabled || this.uploading) return;

    if (this.empty) {
      await this.toast('Assinatura vazia. Desenhe antes de salvar.', 'warning');
      return;
    }

    const canvas = this.getCanvas();
    if (!canvas) {
      await this.toast('Canvas não disponível para salvar.', 'danger');
      return;
    }

    try {
      this.uploading = true;

      const dataUrl = canvas.toDataURL('image/png');
      const blob = this.dataUrlToBlob(dataUrl);
      const filename = this.buildFilename('signature');

      const resp: any = await firstValueFrom(
        this.api.uploadFile(this.tenantId, blob, filename, this.category, this.purpose),
      );

      const id = resp?.id_file_object ?? resp?.id ?? null;
      if (!id) throw new Error('Upload retornou sem id_file_object.');

      this.value = { id_file_object: Number(id) };
      this.valueChange.emit(this.value);

      this.previewUrl = this.buildFileUrl(Number(id));
      this.showCanvas = false;

      await this.toast('Assinatura salva com sucesso.', 'success');
    } catch (e) {
      console.error(e);
      await this.toast('Erro ao salvar assinatura.', 'danger');
    } finally {
      this.uploading = false;
    }
  }

  signAgain(): void {
    if (this.disabled || this.uploading) return;

    this.previewUrl = null;
    this.showCanvas = true;

    // força reinit (porque canvas não existia)
    this.canvasInitialized = false;
    this.ctx = null;

    // next view check init + clear
  }

  isEmpty(): boolean {
    return this.empty;
  }

  // -------------------------
  // Drawing events
  // -------------------------
  onPointerDown(e: PointerEvent): void {
    if (this.disabled || this.uploading) return;

    const ctx = this.ensureCtx();
    const canvas = this.getCanvas();
    if (!ctx || !canvas) return;

    e.preventDefault();
    this.applyStyle();

    canvas.setPointerCapture(e.pointerId);

    this.drawing = true;
    this.last = this.pointFromEvent(e);

    ctx.beginPath();
    ctx.moveTo(this.last.x, this.last.y);
  }

  onPointerMove(e: PointerEvent): void {
    if (this.disabled || this.uploading) return;
    if (!this.drawing || !this.last) return;

    const ctx = this.ensureCtx();
    if (!ctx) return;

    e.preventDefault();

    const p = this.pointFromEvent(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();

    this.last = p;
    this.empty = false;
  }

  onPointerUp(_e?: PointerEvent): void {
    if (this.disabled || this.uploading) return;
    if (!this.drawing) return;

    const ctx = this.ensureCtx();
    if (ctx) ctx.closePath();

    this.drawing = false;
    this.last = null;
  }

  private pointFromEvent(e: PointerEvent): { x: number; y: number } {
    const canvas = this.getCanvas();
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private applyStyle(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.options?.penColor || '#000';

    const lw = this.options?.lineWidth ?? this.options?.maxWidth ?? this.options?.minWidth ?? 2;
    ctx.lineWidth = lw;
  }

  private redrawBackground(): void {
    const ctx = this.ensureCtx();
    const canvas = this.getCanvas();
    if (!ctx || !canvas) return;

    const bg = this.options?.backgroundColor;
    if (!bg || bg === 'transparent') return;

    const rect = canvas.getBoundingClientRect();

    ctx.save();
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.restore();
  }

  private dataUrlToBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
  }

  private buildFilename(prefix: string): string {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return `${prefix}_${this.purpose}_${ts}.png`;
  }

  private async toast(message: string, color: 'success' | 'warning' | 'danger' | 'primary' = 'primary') {
    const t = await this.toastCtrl.create({ message, duration: 2200, color });
    await t.present();
  }
}
