import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';

// Standalone Ionic Components
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';

import {
  FormElement,
  InputType,
  LocalizedText,
  FieldElement,
} from 'src/app/components/form-renderer/form-renderer.types';

type Mode = 'FIELD' | 'STATIC';

@Component({
  selector: 'app-element-editor-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,

    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ isEdit ? 'Editar elemento' : 'Novo elemento' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">Fechar</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-list>

        <ion-item>
          <ion-label position="stacked">Tipo</ion-label>
          <ion-select [(ngModel)]="mode" [disabled]="isEdit">
            <ion-select-option value="FIELD">Campo</ion-select-option>
            <ion-select-option value="STATIC">Texto/Bloco</ion-select-option>
          </ion-select>
        </ion-item>

        <!-- ===== FIELD ===== -->
        <ng-container *ngIf="mode === 'FIELD'">
          <ion-item>
            <ion-label position="stacked">Key (identificador)</ion-label>
            <ion-input [(ngModel)]="fieldKey" placeholder="ex: nome_paciente"></ion-input>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Input Type</ion-label>
            <ion-select [(ngModel)]="fieldInputType">
              <ion-select-option *ngFor="let t of inputTypeOptions" [value]="t">
                {{ t }}
              </ion-select-option>
            </ion-select>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Label (pt)</ion-label>
            <ion-input
              [value]="label['pt'] || ''"
              (ionInput)="setLabel('pt', $event.detail.value ?? '')"
            ></ion-input>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Label (en)</ion-label>
            <ion-input
              [value]="label['en'] || ''"
              (ionInput)="setLabel('en', $event.detail.value ?? '')"
            ></ion-input>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Placeholder (pt)</ion-label>
            <ion-input
              [value]="placeholder['pt'] || ''"
              (ionInput)="setPlaceholder('pt', $event.detail.value ?? '')"
            ></ion-input>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Placeholder (en)</ion-label>
            <ion-input
              [value]="placeholder['en'] || ''"
              (ionInput)="setPlaceholder('en', $event.detail.value ?? '')"
            ></ion-input>
          </ion-item>
        </ng-container>

        <!-- ===== STATIC ===== -->
        <ng-container *ngIf="mode === 'STATIC'">
          <ion-item>
            <ion-label position="stacked">Tipo de texto</ion-label>
            <ion-select [(ngModel)]="staticType">
              <ion-select-option value="TITLE">TITLE</ion-select-option>
              <ion-select-option value="SUBTITLE">SUBTITLE</ion-select-option>
              <ion-select-option value="TEXT_BLOCK">TEXT_BLOCK</ion-select-option>
            </ion-select>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Texto (pt)</ion-label>
            <ion-textarea
              autoGrow="true"
              [value]="text['pt'] || ''"
              (ionInput)="setText('pt', $event.detail.value ?? '')"
            ></ion-textarea>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Texto (en)</ion-label>
            <ion-textarea
              autoGrow="true"
              [value]="text['en'] || ''"
              (ionInput)="setText('en', $event.detail.value ?? '')"
            ></ion-textarea>
          </ion-item>
        </ng-container>

      </ion-list>

      <div style="margin-top: 14px; display:flex; gap: 10px;">
        <ion-button expand="block" fill="outline" (click)="cancel()" style="flex:1;">
          Cancelar
        </ion-button>
        <ion-button expand="block" (click)="save()" style="flex:1;">
          Salvar
        </ion-button>
      </div>
    </ion-content>
  `,
})
export class ElementEditorModal implements OnInit {
  @Input() element?: FormElement;
  @Input() defaultLanguage: 'pt' | 'en' = 'pt';

  isEdit = false;

  mode: Mode = 'FIELD';

  // FIELD
  fieldKey = '';
  fieldInputType: InputType = 'TEXT';
  label: LocalizedText = { pt: '', en: '' };
  placeholder: LocalizedText = { pt: '', en: '' };

  inputTypeOptions: InputType[] = [
    'TEXT',
    'TEXTAREA',
    'NUMBER',
    'DATE',
    'BOOL',
    'SINGLE_CHOICE',
    'MULTI_CHOICE',
    'SELECT',
    'PHOTO',
    'SIGNATURE',
  ];

  // STATIC
  staticType: 'TITLE' | 'SUBTITLE' | 'TEXT_BLOCK' = 'TEXT_BLOCK';
  text: LocalizedText = { pt: '', en: '' };

  constructor(private modalCtrl: ModalController) {}

  ngOnInit(): void {
    if (!this.element) return;

    this.isEdit = true;

    if (this.element.type === 'FIELD') {
      const el = this.element as FieldElement;
      this.mode = 'FIELD';
      this.fieldKey = el.key ?? '';
      this.fieldInputType = (el.input_type ?? 'TEXT') as InputType;

      this.label = {
        pt: (el.label && el.label['pt']) ? el.label['pt'] : '',
        en: (el.label && el.label['en']) ? el.label['en'] : '',
      };

      this.placeholder = {
        pt: (el.placeholder && el.placeholder['pt']) ? el.placeholder['pt'] : '',
        en: (el.placeholder && el.placeholder['en']) ? el.placeholder['en'] : '',
      };
      return;
    }

    // STATIC: TITLE / SUBTITLE / TEXT_BLOCK
    if (this.element.type === 'TITLE' || this.element.type === 'SUBTITLE' || this.element.type === 'TEXT_BLOCK') {
      this.mode = 'STATIC';
      this.staticType = this.element.type;
      const t = (this.element as any).text as LocalizedText;
      this.text = {
        pt: (t && t['pt']) ? t['pt'] : '',
        en: (t && t['en']) ? t['en'] : '',
      };
      return;
    }

    // Outros estáticos (DIVIDER, IMAGE_DECORATIVE) não estão no editor por enquanto
    // Se precisar, adicionamos depois.
  }

  setLabel(lang: 'pt' | 'en', v: string) {
    this.label = { ...this.label, [lang]: v };
  }

  setPlaceholder(lang: 'pt' | 'en', v: string) {
    this.placeholder = { ...this.placeholder, [lang]: v };
  }

  setText(lang: 'pt' | 'en', v: string) {
    this.text = { ...this.text, [lang]: v };
  }

  cancel() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  save() {
    let built: FormElement | null = null;

    if (this.mode === 'FIELD') {
      const key = (this.fieldKey || '').trim(); // sem trimStart/trimLeft p/ evitar ES2019
      if (!key) {
        // você pode trocar isso por Toast depois
        alert('Informe a key do campo.');
        return;
      }

      const el: FieldElement = {
        type: 'FIELD',
        key,
        input_type: this.fieldInputType,
        label: {
          pt: this.label['pt'] || '',
          en: this.label['en'] || '',
        },
        placeholder: {
          pt: this.placeholder['pt'] || '',
          en: this.placeholder['en'] || '',
        },
      };

      built = el;
    } else {
      built = {
        type: this.staticType,
        text: {
          pt: this.text['pt'] || '',
          en: this.text['en'] || '',
        },
      } as any;
    }

    this.modalCtrl.dismiss(built, 'save');
  }
}
