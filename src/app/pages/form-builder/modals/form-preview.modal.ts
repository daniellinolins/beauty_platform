import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonText,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-form-preview-modal',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonText,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Pré-visualização</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">Fechar</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-text *ngIf="!elements || elements.length === 0">
        <p>Sem elementos para pré-visualizar.</p>
      </ion-text>

      <ng-container *ngFor="let e of elements">
        <h1 *ngIf="e.type === 'TITLE'" style="margin-top: 12px;">
          {{ getTextLocalized(e.text) }}
        </h1>

        <h2 *ngIf="e.type === 'SUBTITLE'" style="margin-top: 12px;">
          {{ getTextLocalized(e.text) }}
        </h2>

        <p *ngIf="e.type === 'TEXT_BLOCK'" style="white-space: pre-wrap; margin-top: 10px;">
          {{ getTextLocalized(e.text) }}
        </p>

        <hr *ngIf="e.type === 'DIVIDER'" style="margin: 16px 0;" />

        <div *ngIf="e.type === 'FIELD'" style="margin-top: 10px; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
          <div style="font-weight: 600;">
            {{ getTextLocalized(e.field?.label) || e.field?.key }}
          </div>
          <div style="font-size: 12px; opacity: .7; margin-top: 4px;">
            key: {{ e.field?.key }} | input_type: {{ e.field?.input_type }}
          </div>
        </div>
      </ng-container>
    </ion-content>
  `,
})
export class FormPreviewModal {
  @Input() schema: any;
  @Input() defaultLang = 'pt-PT';

  constructor(private modalCtrl: ModalController) {}

  close() {
    this.modalCtrl.dismiss();
  }

  get elements(): any[] {
    const sections = this.schema?.sections || [];
    const all: any[] = [];
    for (const s of sections) {
      for (const el of (s.elements || [])) all.push(el);
    }
    return all;
  }

  getTextLocalized(textObj: any): string {
    if (!textObj) return '';
    if (typeof textObj === 'string') return textObj;
    return textObj?.[this.defaultLang] || textObj?.['pt-PT'] || textObj?.['pt-BR'] || '';
  }
}
