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
} from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular';

import { FormRendererComponent } from 'src/app/components/form-renderer/form-renderer.component';
import { FormElement } from 'src/app/components/form-renderer/form-renderer.types';

@Component({
  selector: 'app-form-preview-modal',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonSegment,
    IonSegmentButton,
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

      <ion-toolbar>
        <ion-segment [value]="language" (ionChange)="setLanguage(($event.detail.value ?? 'pt').toString())">
          <ion-segment-button value="pt">PT</ion-segment-button>
          <ion-segment-button value="en">EN</ion-segment-button>
        </ion-segment>
      </ion-toolbar>

      <ion-toolbar *ngIf="sections?.length">
        <ion-segment
          [value]="'' + sectionIndex"
          (ionChange)="setSectionIndex(($event.detail.value ?? '0').toString())"
        >
          <ion-segment-button *ngFor="let s of sections; let i = index" [value]="'' + i">
            {{ sTitle(s) }}
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <app-form-renderer
        [defaultLang]="language"
        [elements]="currentElements"
        [payload]="{}"
      ></app-form-renderer>
    </ion-content>
  `,
})
export class FormPreviewModal implements OnInit {
  @Input() tenantId!: number;

  // compatível com o preview() atual do FormBuilderPage
  @Input() defaultLang: string = 'pt';
  @Input() elements: FormElement[] = [];

  // opcional (se no futuro quiseres passar o schema e preview por seção)
  @Input() schema?: any;

  language: 'pt' | 'en' = 'pt';
  sectionIndex = 0;

  sections: any[] | null = null;
  currentElements: FormElement[] = [];

  constructor(private modalCtrl: ModalController) {}

  ngOnInit() {
    this.language = this.defaultLang === 'en' ? 'en' : 'pt';

    // Se vier schema, habilita preview por seção. Se não, usa "elements" direto.
    const maybeSections = this.schema?.sections;
    if (Array.isArray(maybeSections) && maybeSections.length) {
      this.sections = maybeSections;
      this.sectionIndex = 0;
      this.refreshElementsFromSection();
    } else {
      this.sections = null;
      this.currentElements = Array.isArray(this.elements) ? this.elements : [];
    }
  }

  setLanguage(v: string) {
    this.language = v === 'en' ? 'en' : 'pt';
  }

  setSectionIndex(v: string) {
    const n = parseInt(v, 10);
    this.sectionIndex = Number.isFinite(n) ? n : 0;
    this.refreshElementsFromSection();
  }

  private refreshElementsFromSection() {
    const s = this.sections?.[this.sectionIndex];
    const els = s?.elements;
    this.currentElements = Array.isArray(els) ? els : [];
  }

  sTitle(section: any): string {
    // tenta pegar título pt/en com fallback
    const t = section?.title;
    const v = this.language === 'en' ? (t?.en ?? t?.pt) : (t?.pt ?? t?.en);
    return (v ?? `Seção ${this.sectionIndex + 1}`).toString();
  }

  close() {
    this.modalCtrl.dismiss();
  }
}
