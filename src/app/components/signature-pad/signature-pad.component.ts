import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  ViewChild,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular';

@Component({
  selector: 'app-signature-pad',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './signature-pad.component.html',
  styleUrls: ['./signature-pad.component.scss'],
})
export class SignaturePadComponent implements AfterViewInit, OnDestroy {
  @Input() title: string = 'Assinatura';
  @Input() hint: string = 'Assine com o dedo ou caneta.';
  @Input() background: string = '#ffffff';

  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private drawing = false;
  private lastX = 0;
  private lastY = 0;

  private resizeObserver?: ResizeObserver;

  hasStroke = false;
  private lineWidth = 2.2;

  constructor(private modalCtrl: ModalController) {}

  ngAfterViewInit() {
    this.setupCanvas();

    const canvas = this.canvasRef.nativeElement;
    const parent = canvas.parentElement;
    if (parent && 'ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => {
        this.setupCanvas();
      });
      this.resizeObserver.observe(parent);
    }
  }

  ngOnDestroy() {
    try {
      this.resizeObserver?.disconnect();
    } catch {}
  }

  private setupCanvas() {
    const canvas = this.canvasRef.nativeElement;
    const parent = canvas.parentElement;

    const width = parent ? parent.clientWidth : 320;
    const height = 220;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    this.ctx = ctx;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.ctx.fillStyle = this.background;
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.strokeStyle = '#111';
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';

    this.hasStroke = false;
    this.drawing = false;
  }

  clear() {
    this.setupCanvas();
  }

  cancel() {
    this.modalCtrl.dismiss({ ok: false });
  }

  async save(): Promise<void> {
    if (!this.hasStroke) {
      this.modalCtrl.dismiss({ ok: false, empty: true });
      return;
    }

    const canvas = this.canvasRef.nativeElement;

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png', 1.0)
    );

    if (!blob) {
      this.modalCtrl.dismiss({ ok: false, error: 'blob_failed' });
      return;
    }

    this.modalCtrl.dismiss({
      ok: true,
      mime_type: 'image/png',
      blob,
    });
  }

  onPointerDown(ev: PointerEvent) {
    ev.preventDefault();
    const { x, y } = this.getCanvasPoint(ev);
    this.drawing = true;
    this.lastX = x;
    this.lastY = y;
  }

  onPointerMove(ev: PointerEvent) {
    if (!this.drawing) return;
    ev.preventDefault();

    const { x, y } = this.getCanvasPoint(ev);

    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();

    this.lastX = x;
    this.lastY = y;
    this.hasStroke = true;
  }

  onPointerUp(ev: PointerEvent) {
    ev.preventDefault();
    this.drawing = false;
  }

  onPointerLeave(ev: PointerEvent) {
    ev.preventDefault();
    this.drawing = false;
  }

  private getCanvasPoint(ev: PointerEvent) {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }
}
