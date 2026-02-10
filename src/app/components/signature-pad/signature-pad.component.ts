import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export type SignaturePadOptions = {
  penColor?: string;
  lineWidth?: number;
  backgroundColor?: string;
  minWidth?: number;
  maxWidth?: number;
};

@Component({
  // ✅ compat: alguns templates referenciam <app-signature-pad>
  selector: 'signature-pad, app-signature-pad',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './signature-pad.component.html',
  styleUrls: ['./signature-pad.component.scss'],
})
export class SignaturePadComponent implements AfterViewInit {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() options: SignaturePadOptions = {
    penColor: '#000',
    lineWidth: 2,
    backgroundColor: 'transparent',
  };

  // ✅ compat p/ renderer
  @Input() disabled: boolean = false;
  @Input() tenantId: number = 1;
  @Input() value: any = null;

  // Se quiser desligar emissão automática ao levantar o dedo, set false no template
  @Input() emitOnEnd: boolean = true;
  @Output() valueChange = new EventEmitter<any>();

  private ctx!: CanvasRenderingContext2D;
  private drawing = false;
  private empty = true;
  private last: { x: number; y: number } | null = null;

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    this.ctx = ctx;

    this.resizeCanvas();
    this.applyStyle();
  }

  resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redrawBackground();
  }

  clear(): void {
    if (this.disabled) return;

    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.redrawBackground();
    this.empty = true;
    this.last = null;

    this.value = null;
    this.valueChange.emit(null);
  }

  isEmpty(): boolean {
    return this.empty;
  }

  toDataURL(type: string = 'image/png', quality?: number): string {
    return this.canvasRef.nativeElement.toDataURL(type, quality);
  }

  onPointerDown(e: PointerEvent): void {
    if (this.disabled) return;

    e.preventDefault();
    this.applyStyle();

    const canvas = this.canvasRef.nativeElement;
    canvas.setPointerCapture(e.pointerId);

    this.drawing = true;
    this.last = this.pointFromEvent(e);

    this.ctx.beginPath();
    this.ctx.moveTo(this.last.x, this.last.y);
  }

  onPointerMove(e: PointerEvent): void {
    if (this.disabled) return;
    if (!this.drawing || !this.last) return;

    e.preventDefault();

    const p = this.pointFromEvent(e);
    this.ctx.lineTo(p.x, p.y);
    this.ctx.stroke();

    this.last = p;
    this.empty = false;
  }

  onPointerUp(_e?: PointerEvent): void {
    if (this.disabled) return;
    if (!this.drawing) return;

    this.drawing = false;
    this.last = null;
    this.ctx.closePath();

    if (this.emitOnEnd) {
      try {
        const dataUrl = this.toDataURL('image/png');
        this.value = dataUrl;
        this.valueChange.emit(dataUrl);
      } catch {}
    }
  }

  private pointFromEvent(e: PointerEvent): { x: number; y: number } {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private applyStyle(): void {
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = this.options?.penColor || '#000';

    const lw =
      this.options?.lineWidth ??
      this.options?.maxWidth ??
      this.options?.minWidth ??
      2;

    this.ctx.lineWidth = lw;
  }

  private redrawBackground(): void {
    const bg = this.options?.backgroundColor;
    if (!bg || bg === 'transparent') return;

    const canvas = this.canvasRef.nativeElement;
    const ctx = this.ctx;

    const rect = canvas.getBoundingClientRect();
    ctx.save();
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.restore();
  }
}
