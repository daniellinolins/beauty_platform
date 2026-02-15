import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonSegment,
  IonSegmentButton,
  IonLabel,
} from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular';

import { FormRendererComponent } from 'src/app/components/form-renderer/form-renderer.component';
import { FormElement, UiLang } from 'src/app/components/form-renderer/form-renderer.types';

@Component({
  selector: 'app-form-preview-modal',
  standalone: true,
  imports: [
    CommonModule,

    // Ionic standalone
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonSegment,
    IonSegmentButton,
    IonLabel,

    // Renderer
    FormRendererComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Preview</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">Fechar</ion-button>
        </ion-buttons>
      </ion-toolbar>

      <!-- Idioma -->
      <ion-toolbar>
        <ion-segment [value]="language" (ionChange)="setLanguage(($event.detail.value ?? 'pt-PT').toString())">
          <ion-segment-button value="pt-PT">
            <ion-label>PT</ion-label>
          </ion-segment-button>
          <ion-segment-button value="en-US">
            <ion-label>EN</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>

      <!-- Seções (aparece só se existir schema.sections) -->
      <ion-toolbar *ngIf="(sections?.length ?? 0) > 1">
        <ion-segment [value]="sectionIndexStr" (ionChange)="setSectionIndex(($event.detail.value ?? '0').toString())">
          <ion-segment-button *ngFor="let s of sections; let i = index" [value]="i.toString()">
            <ion-label>{{ sectionTitle(s, i) }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ng-container *ngIf="elementsToRender?.length; else empty">
        <app-form-renderer
          [elements]="elementsToRender"
          [defaultLang]="language"
        ></app-form-renderer>
      </ng-container>

      <ng-template #empty>
        <p style="opacity:.7">Nenhum elemento no formulário.</p>
      </ng-template>
    </ion-content>
  `,
})
export class FormPreviewModal implements OnInit {
  /**
   * Preferimos receber o schema completo para permitir trocar seção no preview.
   * Mas, se você quiser, também pode passar `elements` direto.
   */
  @Input() schema: any | null = null;
  @Input() elements: FormElement[] | null = null;

  @Input() initialSectionIndex: number = 0;

  /** Pode vir como 'pt'/'en' do builder; normalizamos para 'pt-PT'/'en-US'. */
  @Input() defaultLanguage: string = 'pt-PT';

  language: UiLang = 'pt-PT';

  sections: any[] = [];
  sectionIndex = 0;

  constructor(private modalCtrl: ModalController) {}

  ngOnInit(): void {
    this.language = this.normalizeLang(this.defaultLanguage);

    // se veio schema com sections, usa por seção
    const secs = Array.isArray(this.schema?.sections) ? this.schema.sections : [];
    this.sections = secs;

    const idx = Number.isFinite(this.initialSectionIndex) ? this.initialSectionIndex : 0;
    this.sectionIndex = (idx >= 0 && idx < this.sections.length) ? idx : 0;
  }

  get sectionIndexStr(): string {
    return this.sectionIndex.toString();
  }

  get elementsToRender(): FormElement[] {
    // 1) schema por seção
    if (this.sections?.length) {
      const sec = this.sections[this.sectionIndex];
      const els = Array.isArray(sec?.elements) ? sec.elements : [];
      return els as FormElement[];
    }

    // 2) fallback: lista plana recebida
    if (Array.isArray(this.elements)) return this.elements;

    return [];
  }

  setLanguage(v: string) {
    this.language = this.normalizeLang(v);
  }

  setSectionIndex(v: string) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return;
    if (n < 0 || n >= (this.sections?.length || 0)) return;
    this.sectionIndex = n;
  }

  sectionTitle(section: any, index: number): string {
    const t = section?.title;
    const name = this.pickLocalizedText(t);
    return name ? name.toString() : `Seção ${index + 1}`;
  }

  private pickLocalizedText(t: any): string {
    if (!t || typeof t !== 'object') return '';

    const base = this.language.toLowerCase().startsWith('en') ? 'en' : 'pt';
    const preferredKeys = base === 'en'
      ? ['en-US', 'en-GB', 'en']
      : ['pt-PT', 'pt-BR', 'pt'];

    for (const k of preferredKeys) {
      const v = t[k];
      if (typeof v === 'string' && v.trim().length) return v;
    }

    // fallback: first non-empty
    for (const v of Object.values(t)) {
      if (typeof v === 'string' && v.trim().length) return v;
    }
    return '';
  }

  close() {
    this.modalCtrl.dismiss();
  }

  private normalizeLang(v: string): UiLang {
    const s = (v || '').toString().toLowerCase();

    if (s === 'en' || s === 'en-us' || s === 'en_us') return 'en-US';
    if (s === 'pt' || s === 'pt-pt' || s === 'pt_pt') return 'pt-PT';

    // defaults do seu form table às vezes vêm pt-PT / en-US
    if (s.startsWith('en')) return 'en-US';
    return 'pt-PT';
  }
}
