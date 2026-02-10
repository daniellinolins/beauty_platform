import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonToggle,
  ModalController,
  NavParams,
  IonIcon,
} from '@ionic/angular/standalone';

type LocalizedText = Record<string, string>;

type FieldOption = {
  value: string;
  label?: LocalizedText;
};

type FormField = {
  key: string;
  label?: LocalizedText;
  input_type:
    | 'TEXT'
    | 'TEXTAREA'
    | 'NUMBER'
    | 'DATE'
    | 'BOOL'
    | 'SINGLE_CHOICE'
    | 'MULTI_CHOICE'
    | 'SELECT'
    | 'PHOTO'
    | 'SIGNATURE';
  required?: boolean;

  // regras
  min?: number;
  max?: number;
  regex?: string;

  // choices/select
  options?: FieldOption[];
  multiple?: boolean;
};

type StaticElement =
  | { type: 'TITLE' | 'SUBTITLE' | 'TEXT_BLOCK'; text: LocalizedText }
  | { type: 'DIVIDER' }
  | {
      type: 'IMAGE_DECORATIVE';
      image_url: string;
      alt?: LocalizedText;
      caption?: LocalizedText;
    };

type FieldElement = { type: 'FIELD'; field: FormField };

type FormElement = StaticElement | FieldElement;

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
    IonToggle,
    IonIcon,
  ],
  template: `
  <ion-header>
    <ion-toolbar>
      <ion-title>{{ isEdit ? 'Editar elemento' : 'Adicionar elemento' }}</ion-title>
      <ion-buttons slot="end">
        <ion-button (click)="cancel()">Cancelar</ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>

  <ion-content class="ion-padding">
    <ion-list>

      <ion-item>
        <ion-label position="stacked">Tipo</ion-label>
        <ion-select [(ngModel)]="type">
          <ion-select-option value="TITLE">TITLE</ion-select-option>
          <ion-select-option value="SUBTITLE">SUBTITLE</ion-select-option>
          <ion-select-option value="TEXT_BLOCK">TEXT_BLOCK</ion-select-option>
          <ion-select-option value="DIVIDER">DIVIDER</ion-select-option>
          <ion-select-option value="IMAGE_DECORATIVE">IMAGE_DECORATIVE</ion-select-option>
          <ion-select-option value="FIELD">FIELD</ion-select-option>
        </ion-select>
      </ion-item>

      <!-- STATIC TEXT -->
      <ng-container *ngIf="type === 'TITLE' || type === 'SUBTITLE' || type === 'TEXT_BLOCK'">
        <ion-item>
          <ion-label position="stacked">Texto ({{ defaultLanguage }})</ion-label>
          <ion-textarea autoGrow="true" [(ngModel)]="text"></ion-textarea>
        </ion-item>
      </ng-container>

      <!-- IMAGE -->
      <ng-container *ngIf="type === 'IMAGE_DECORATIVE'">
        <ion-item>
          <ion-label position="stacked">URL da imagem</ion-label>
          <ion-input [(ngModel)]="imageUrl"></ion-input>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Alt ({{ defaultLanguage }})</ion-label>
          <ion-input [(ngModel)]="imageAlt"></ion-input>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Legenda ({{ defaultLanguage }})</ion-label>
          <ion-textarea autoGrow="true" [(ngModel)]="imageCaption"></ion-textarea>
        </ion-item>
      </ng-container>

      <!-- FIELD -->
      <ng-container *ngIf="type === 'FIELD'">

        <ion-item>
          <ion-label position="stacked">Key</ion-label>
          <ion-input [(ngModel)]="fieldKey"></ion-input>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Label ({{ defaultLanguage }})</ion-label>
          <ion-input [(ngModel)]="fieldLabel"></ion-input>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Input type</ion-label>
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

        <ion-item>
          <ion-label>Required</ion-label>
          <ion-toggle slot="end" [(ngModel)]="required"></ion-toggle>
        </ion-item>

        <!-- Basic rules -->
        <ng-container *ngIf="inputType === 'NUMBER'">
          <ion-item>
            <ion-label position="stacked">Min</ion-label>
            <ion-input type="number" [(ngModel)]="min"></ion-input>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Max</ion-label>
            <ion-input type="number" [(ngModel)]="max"></ion-input>
          </ion-item>
        </ng-container>

        <ng-container *ngIf="inputType === 'TEXT' || inputType === 'TEXTAREA'">
          <ion-item>
            <ion-label position="stacked">Regex (opcional)</ion-label>
            <ion-input [(ngModel)]="regex"></ion-input>
          </ion-item>
        </ng-container>

        <!-- Options -->
        <ng-container *ngIf="needsOptions()">
          <ion-item>
            <ion-label>Multiple</ion-label>
            <ion-toggle slot="end" [(ngModel)]="multiple"></ion-toggle>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Opções (1 por linha: value|label)</ion-label>
            <ion-textarea autoGrow="true" [(ngModel)]="optionsText"></ion-textarea>
          </ion-item>
          <div style="font-size: 12px; opacity:.75; margin-top:6px;">
            Exemplo:<br/>
            yes|Sim<br/>
            no|Não
          </div>
        </ng-container>

      </ng-container>

    </ion-list>

    <ion-button expand="block" (click)="ok()">OK</ion-button>
  </ion-content>
  `,
})
export class ElementEditorModal {
  defaultLanguage = 'pt-PT';
  isEdit = false;

  type: FormElement['type'] = 'FIELD';

  // static text
  text = '';

  // image
  imageUrl = '';
  imageAlt = '';
  imageCaption = '';

  // field
  fieldKey = '';
  fieldLabel = '';
  inputType: FormField['input_type'] = 'TEXT';
  required = false;

  min?: number;
  max?: number;
  regex = '';

  // options
  multiple = false;
  optionsText = '';

  constructor(private modalCtrl: ModalController, private nav: NavParams) {
    this.defaultLanguage = this.nav.get('defaultLanguage') || 'pt-PT';

    const existing: FormElement | null = this.nav.get('existing') || null;
    if (existing) {
      this.isEdit = true;
      this.type = existing.type;

      if (existing.type === 'TITLE' || existing.type === 'SUBTITLE' || existing.type === 'TEXT_BLOCK') {
        this.text = (existing.text?.[this.defaultLanguage] || '') as string;
      }

      if (existing.type === 'IMAGE_DECORATIVE') {
        this.imageUrl = existing.image_url || '';
        this.imageAlt = existing.alt?.[this.defaultLanguage] || '';
        this.imageCaption = existing.caption?.[this.defaultLanguage] || '';
      }

      if (existing.type === 'FIELD') {
        this.fieldKey = existing.field.key || '';
        this.fieldLabel = existing.field.label?.[this.defaultLanguage] || '';
        this.inputType = existing.field.input_type;
        this.required = !!existing.field.required;

        this.min = existing.field.min;
        this.max = existing.field.max;
        this.regex = existing.field.regex || '';

        this.multiple = !!existing.field.multiple;
        const opts = existing.field.options || [];
        this.optionsText = opts
          .map((o) => `${o.value}|${o.label?.[this.defaultLanguage] || ''}`)
          .join('\n');
      }
    }
  }

  needsOptions(): boolean {
    return this.type === 'FIELD' && (this.inputType === 'SINGLE_CHOICE' || this.inputType === 'MULTI_CHOICE' || this.inputType === 'SELECT');
  }

  private parseOptions(): FieldOption[] {
    const lines = (this.optionsText || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const out: FieldOption[] = [];
    for (const line of lines) {
      const [valueRaw, labelRaw] = line.split('|');
      const value = (valueRaw || '').trim();
      const label = (labelRaw || '').trim();
      if (!value) continue;

      out.push({
        value,
        label: label ? { [this.defaultLanguage]: label } : undefined,
      });
    }
    return out;
  }

  cancel() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  ok() {
    let element: FormElement;

    if (this.type === 'DIVIDER') {
      element = { type: 'DIVIDER' };
    } else if (this.type === 'IMAGE_DECORATIVE') {
      element = {
        type: 'IMAGE_DECORATIVE',
        image_url: this.imageUrl || '',
        alt: this.imageAlt ? { [this.defaultLanguage]: this.imageAlt } : undefined,
        caption: this.imageCaption ? { [this.defaultLanguage]: this.imageCaption } : undefined,
      };
    } else if (this.type === 'TITLE' || this.type === 'SUBTITLE' || this.type === 'TEXT_BLOCK') {
      element = {
        type: this.type,
        text: { [this.defaultLanguage]: this.text || '' },
      };
    } else {
      const opts = this.needsOptions() ? this.parseOptions() : undefined;

      element = {
        type: 'FIELD',
        field: {
          key: (this.fieldKey || '').trim(),
          label: this.fieldLabel ? { [this.defaultLanguage]: this.fieldLabel } : undefined,
          input_type: this.inputType,
          required: !!this.required,
          min: this.min,
          max: this.max,
          regex: (this.regex || '').trim() || undefined,
          multiple: !!this.multiple,
          options: opts,
        },
      };
    }

    // ✅ IMPORTANTE: devolve no formato esperado pelo builder
    this.modalCtrl.dismiss({ element }, 'ok');
  }
}
