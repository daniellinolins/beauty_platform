import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { IonicModule, ToastController } from '@ionic/angular';
import { ApiService } from 'src/app/services/api';
import { environment } from '../../../environments/environment';

export type DrawOnImageOptions = {
  penColor?: string;
  lineWidth?: number;
  minWidth?: number;
  maxWidth?: number;
};

@Component({
  selector: 'app-draw-on-image',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './draw-on-image.component.html',
  styleUrls: ['./draw-on-image.component.scss'],
})
export class DrawOnImageComponent implements AfterViewInit, AfterViewChecked, OnDestroy {
  // ✅ static false pois o canvas está dentro de *ngIf
  @ViewChild('canvas', { static: false }) canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('bgImg', { static: false }) bgImgRef?: ElementRef<HTMLImageElement>;
  @ViewChild('wrap', { static: false }) wrapRef?: ElementRef<HTMLDivElement>;

  @Input() backgroundUrl: string = '';

  @Input() options: DrawOnImageOptions = {
    penColor: '#000',
    lineWidth: 2,
  };

  @Input() disabled: boolean = false;
  @Input() tenantId: number = 1;

  @Input() category: 'signatures' | 'photos' | 'pdfs' | 'drawings' = 'drawings';
  @Input() purpose: string = 'drawing';

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
  private resizeObs?: ResizeObserver;

  constructor(private api: ApiService, private toastCtrl: ToastController) {}

  ngAfterViewInit(): void {
    this.syncFromValue();
    this.tryInitCanvasIfVisible();
    this.setupResizeObserver();
  }

  ngAfterViewChecked(): void {
    this.tryInitCanvasIfVisible();
  }

  ngOnChanges(): void {
    this.syncFromValue();
  }

  ngOnDestroy(): void {
    try {
      this.resizeObs?.disconnect();
    } catch {}
  }

  private buildFileUrl(idFile: number): string {
    return `${environment.apiBaseUrl}/api/files/${idFile}?tenant_id=${this.tenantId}`;
  }

  private syncFromValue() {
    const v = this.value as any;

    if (!v) {
      this.previewUrl = null;
      this.showCanvas = true;
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

  private setupResizeObserver() {
    const wrap = this.wrapRef?.nativeElement;
    if (!wrap) return;

    if (typeof ResizeObserver === 'undefined') return;

    this.resizeObs = new ResizeObserver(() => {
      this.resizeCanvas();
    });

    this.resizeObs.observe(wrap);
  }

  onBgLoad(): void {
    // sempre que o background renderizar, ajusta o canvas ao tamanho exibido
    this.resizeCanvas();
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

    this.resizeCanvas();
    this.applyStyle();
    this.clearCanvas(true);
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
  }

  clearCanvas(force = false): void {
    if (!force && (this.disabled || this.uploading)) return;

    const canvas = this.getCanvas();
    const ctx = this.ensureCtx();
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.empty = true;
    this.last = null;
  }

  resetValue(): void {
    if (this.disabled || this.uploading) return;

    this.value = null;
    this.valueChange.emit(null);

    this.previewUrl = null;
    this.showCanvas = true;

    this.canvasInitialized = false;
    this.ctx = null;
  }

  async saveDrawing(): Promise<void> {
    if (this.disabled || this.uploading) return;

    if (this.empty) {
      await this.toast('Desenho vazio. Desenhe antes de salvar.', 'warning');
      return;
    }

    const overlayCanvas = this.getCanvas();
    if (!overlayCanvas) {
      await this.toast('Canvas não disponível para salvar.', 'danger');
      return;
    }

    const bgImg = this.bgImgRef?.nativeElement;
    if (!bgImg || !bgImg.complete) {
      await this.toast('Imagem de fundo ainda não carregou.', 'warning');
      return;
    }

    try {
      this.uploading = true;

      // Mescla background + overlay em um único PNG
      const merged = document.createElement('canvas');
      merged.width = overlayCanvas.width;
      merged.height = overlayCanvas.height;

      const mctx = merged.getContext('2d');
      if (!mctx) throw new Error('merged canvas context not available');

      // ⚠️ Se o background não permitir CORS, esta operação pode "taint" o canvas
      mctx.drawImage(bgImg, 0, 0, merged.width, merged.height);
      mctx.drawImage(overlayCanvas, 0, 0);

      const dataUrl = merged.toDataURL('image/png');
      const blob = this.dataUrlToBlob(dataUrl);
      const filename = this.buildFilename('drawing');

      const resp: any = await firstValueFrom(
        this.api.uploadFile(this.tenantId, blob, filename, this.category, this.purpose),
      );

      const id = resp?.id_file_object ?? resp?.id ?? null;
      if (!id) throw new Error('Upload retornou sem id_file_object.');

      this.value = { id_file_object: Number(id) };
      this.valueChange.emit(this.value);

      this.previewUrl = this.buildFileUrl(Number(id));
      this.showCanvas = false;

      await this.toast('Desenho salvo com sucesso.', 'success');
    } catch (e: any) {
      console.error(e);
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes('tainted') || msg.includes('security')) {
        await this.toast(
          'Erro ao salvar: a imagem de fundo não permite uso em canvas (CORS). Use uma URL com CORS habilitado.',
          'danger',
        );
      } else {
        await this.toast('Erro ao salvar desenho.', 'danger');
      }
    } finally {
      this.uploading = false;
    }
  }

  drawAgain(): void {
    if (this.disabled || this.uploading) return;

    this.previewUrl = null;
    this.showCanvas = true;

    this.canvasInitialized = false;
    this.ctx = null;
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
    const t = await this.toastCtrl.create({ message, duration: 2600, color });
    await t.present();
  }
}
