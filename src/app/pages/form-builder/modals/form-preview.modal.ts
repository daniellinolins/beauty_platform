import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  ModalController,
  NavParams,
  IonText,
} from '@ionic/angular/standalone';

import { FormRendererComponent } from 'src/app/components/form-renderer/form-renderer.component';
import { FormElement } from 'src/app/components/form-renderer/form-renderer.types';

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
    IonText,
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
    </ion-header>

    <ion-content class="ion-padding">
      <ng-container *ngIf="elements?.length; else empty">
        <app-form-renderer
          [elements]="elements"
          [defaultLang]="defaultLanguage"
          [tenantId]="tenantId"
          [mode]="'preview'"
          [payload]="payload"
        ></app-form-renderer>
      </ng-container>

      <ng-template #empty>
        <ion-text color="medium">Nenhum elemento no formulário.</ion-text>
      </ng-template>
    </ion-content>
  `,
})
export class FormPreviewModal {
  tenantId = 1;
  defaultLanguage = 'pt-PT';
  elements: FormElement[] = [];
  payload: Record<string, any> = {};

  constructor(private modalCtrl: ModalController, private nav: NavParams) {
    this.tenantId = Number(this.nav.get('tenantId') || 1);
    this.defaultLanguage = this.nav.get('defaultLanguage') || 'pt-PT';
    this.elements = (this.nav.get('elements') || []) as FormElement[];
  }

  close() {
    this.modalCtrl.dismiss(null, 'close');
  }
}
