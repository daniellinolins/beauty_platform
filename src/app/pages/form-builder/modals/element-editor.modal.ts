import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonTextarea,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-element-editor-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,

    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonItem,
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonTextarea,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Adicionar elemento</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">Cancelar</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-item>
        <ion-label position="stacked">Tipo</ion-label>
        <ion-select [(ngModel)]="type">
          <ion-select-option value="TITLE">Título</ion-select-option>
          <ion-select-option value="SUBTITLE">Subtítulo</ion-select-option>
          <ion-select-option value="TEXT_BLOCK">Bloco de texto</ion-select-option>
          <ion-select-option value="DIVIDER">Divisor</ion-select-option>
          <ion-select-option value="FIELD">Campo</ion-select-option>
        </ion-select>
      </ion-item>

      <ion-item *ngIf="type !== 'FIELD' && type !== 'DIVIDER'">
        <ion-label position="stacked">Texto</ion-label>
        <ion-textarea [(ngModel)]="text" autoGrow="true"></ion-textarea>
      </ion-item>

      <ng-container *ngIf="type === 'FIELD'">
        <ion-item>
          <ion-label position="stacked">Key</ion-label>
          <ion-input [(ngModel)]="fieldKey"></ion-input>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Tipo de input</ion-label>
          <ion-select [(ngModel)]="inputType">
            <ion-select-option value="TEXT">TEXT</ion-select-option>
            <ion-select-option value="TEXTAREA">TEXTAREA</ion-select-option>
            <ion-select-option value="NUMBER">NUMBER</ion-select-option>
            <ion-select-option value="DATE">DATE</ion-select-option>
            <ion-select-option value="BOOL">BOOL</ion-select-option>
            <ion-select-option value="SINGLE_CHOICE">SINGLE_CHOICE</ion-select-option>
            <ion-select-option value="MULTI_CHOICE">MULTI_CHOICE</ion-select-option>
            <ion-select-option value="SELECT">SELECT</ion-select-option>
            <ion-select-option value="PHOTO">PHOTO</ion-select-option>
            <ion-select-option value="SIGNATURE">SIGNATURE</ion-select-option>
          </ion-select>
        </ion-item>
      </ng-container>

      <ion-button expand="block" style="margin-top: 14px;" (click)="confirm()">
        Adicionar
      </ion-button>
    </ion-content>
  `,
})
export class ElementEditorModal {
  @Input() defaultLanguage = 'pt-PT';

  type:
    | 'TITLE'
    | 'SUBTITLE'
    | 'TEXT_BLOCK'
    | 'DIVIDER'
    | 'FIELD' = 'TITLE';

  text = '';
  fieldKey = '';
  inputType = 'TEXT';

  constructor(private modalCtrl: ModalController) {}

  close() {
    this.modalCtrl.dismiss();
  }

  confirm() {
    let element: any;

    if (this.type === 'DIVIDER') {
      element = { type: 'DIVIDER' };
    } else if (this.type === 'FIELD') {
      const key = (this.fieldKey || '').trim();
      if (!key) {
        // mantém simples: não fecha se não tiver key
        return;
      }

      element = {
        type: 'FIELD',
        field: {
          key,
          input_type: this.inputType,
          label: { [this.defaultLanguage]: key },
        },
      };
    } else {
      element = {
        type: this.type,
        text: { [this.defaultLanguage]: this.text || '' },
      };
    }

    this.modalCtrl.dismiss({ element });
  }
}
