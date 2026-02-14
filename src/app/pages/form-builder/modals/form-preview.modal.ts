import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular';

import { FormRendererComponent } from 'src/app/components/form-renderer/form-renderer.component';
import { FormSchema, FormElement } from '../form-schema.types';

@Component({
  selector: 'app-form-preview-modal',
  standalone: true,
  imports: [
    CommonModule,

    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,

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

      <ion-toolbar *ngIf="sections.length > 1">
        <ion-segment
          [value]="sectionIndexStr"
          (ionChange)="setSectionIndex(($event.detail.value ?? '0').toString())"
        >
          <ion-segment-button
            *ngFor="let s of sections; let i = index"
            [value]="'' + i"
          >
            <ion-label>{{ sectionTitle(s?.title) || ('Seção ' + (i + 1)) }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ng-container *ngIf="!schema">
        <p>Sem schema para visualizar.</p>
      </ng-container>

      <ng-container *ngIf="schema">
        <ng-container *ngIf="currentElements.length === 0">
          <p>Nenhum elemento nesta seção.</p>
        </ng-container>

        <ng-container *ngIf="currentElements.length > 0">
          <!-- Reusa seu renderer -->
          <app-form-renderer
            [elements]="currentElements"
          ></app-form-renderer>
        </ng-container>
      </ng-container>
    </ion-content>
  `,
})
export class FormPreviewModal {
  @Input() schema!: FormSchema;
  @Input() sectionIndex: number = 0;
  @Input() defaultLanguage: 'pt' | 'en' = 'pt';

  constructor(private modalCtrl: ModalController) {}

  get sections() {
    return this.schema?.sections || [];
  }

  get sectionIndexStr() {
    return '' + (this.sectionIndex ?? 0);
  }

  get currentElements(): FormElement[] {
    const idx = Number(this.sectionIndex ?? 0);
    return (this.schema?.sections?.[idx]?.elements || []) as FormElement[];
  }

  setSectionIndex(v: string) {
    const n = Number(v);
    this.sectionIndex = Number.isFinite(n) ? n : 0;
  }

  sectionTitle(t: any): string {
    if (!t) return '';
    // t pode ser {pt,en} ou index signature
    const lang = this.defaultLanguage === 'en' ? 'en' : 'pt';
    return (t?.[lang] ?? t?.['pt'] ?? t?.['en'] ?? '').toString();
  }

  close() {
    this.modalCtrl.dismiss();
  }
}
