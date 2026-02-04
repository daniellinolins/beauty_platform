import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export type SignaturePadOptions = {
  penColor?: string;          // default '#000'
  lineWidth?: number;         // default 2
  backgroundColor?: string;   // default 'transparent' | '#fff'
  minWidth?: number;          // compat (se vier do código antigo)
  maxWidth?: number;          // compat (se vier do código antigo)
};

@Component({
  selector: 'signature-pad',
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

    // desenhar em coordenadas CSS (não em pixels reais)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.redrawBackground();
  }

  clear(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.redrawBackground();
    this.empty = true;
    this.last = null;
  }

  isEmpty(): boolean {
    return this.empty;
  }

  toDataURL(type: string = 'image/png', quality?: number): string {
    return this.canvasRef.nativeElement.toDataURL(type, quality);
  }

  onPointerDown(e: PointerEvent): void {
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
    if (!this.drawing || !this.last) return;
    e.preventDefault();

    const p = this.pointFromEvent(e);
    this.ctx.lineTo(p.x, p.y);
    this.ctx.stroke();

    this.last = p;
    this.empty = false;
  }

  onPointerUp(_e?: PointerEvent): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.last = null;
    this.ctx.closePath();
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

    // compat: se vier min/maxWidth, usamos maxWidth como espessura principal
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
    const rect = canvas.getBoundingClientRect();

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'destination-over';
    this.ctx.fillStyle = bg;
    this.ctx.fillRect(0, 0, rect.width, rect.height);
    this.ctx.restore();
  }
}
