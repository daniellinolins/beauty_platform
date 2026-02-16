import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
  IonList,
  IonGrid,
  IonRow,
  IonCol,
  IonIcon,
  IonToggle,
} from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular';

import {
  FormElement,
  FieldElement,
  StaticElement,
  InputType,
  LocalizedText,
  FieldOption,
  FieldRules,
} from 'src/app/components/form-renderer/form-renderer.types';

type StaticType = StaticElement['type'];

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
    IonList,
    IonGrid,
    IonRow,
    IonCol,
    IonIcon,
    IonToggle,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ isEdit ? 'Editar elemento' : 'Novo elemento' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">Cancelar</ion-button>
          <ion-button strong (click)="confirm()">OK</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">

      <ion-item>
        <ion-label position="stacked">Tipo</ion-label>
        <ion-select [(ngModel)]="mode" (ionChange)="onModeChange()">
          <ion-select-option value="FIELD">Campo (FIELD)</ion-select-option>
          <ion-select-option value="STATIC">Estático (TITLE/SUBTITLE/TEXT_BLOCK/DIVIDER/IMAGE)</ion-select-option>
        </ion-select>
      </ion-item>

      <!-- ========================= FIELD ========================= -->
      <ng-container *ngIf="mode === 'FIELD'">

        <ion-item>
          <ion-label position="stacked">Key</ion-label>
          <ion-input [(ngModel)]="field.key" placeholder="ex: customer_level"></ion-input>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Input Type</ion-label>
          <ion-select [(ngModel)]="field.input_type" (ionChange)="onFieldTypeChange()">
            <ion-select-option *ngFor="let it of inputTypeOptions" [value]="it">{{ it }}</ion-select-option>
          </ion-select>
        </ion-item>

        <!-- DRAW_ON_IMAGE config -->
        <ng-container *ngIf="field.input_type === 'DRAW_ON_IMAGE'">
          <ion-item>
            <ion-label position="stacked">Background URL</ion-label>
            <ion-input [(ngModel)]="drawBackgroundUrl" placeholder="https://..."></ion-input>
          </ion-item>
        </ng-container>

        <ion-item>
          <ion-label position="stacked">Label (pt)</ion-label>
          <ion-input [(ngModel)]="labelPt" placeholder="Ex: Nível do cliente"></ion-input>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Label (en)</ion-label>
          <ion-input [(ngModel)]="labelEn" placeholder="Ex: Customer level"></ion-input>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Placeholder (pt)</ion-label>
          <ion-input [(ngModel)]="phPt" placeholder="Ex: Selecione..."></ion-input>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Placeholder (en)</ion-label>
          <ion-input [(ngModel)]="phEn" placeholder="Ex: Select..."></ion-input>
        </ion-item>

        <ion-item lines="full">
          <ion-label>Obrigatório</ion-label>
          <ion-toggle [(ngModel)]="required"></ion-toggle>
        </ion-item>

        <!-- OPTIONS (SELECT / SINGLE_CHOICE / MULTI_CHOICE) -->
        <ng-container *ngIf="needsOptions(field.input_type)">

          <ion-item lines="none">
            <ion-label>
              <h2>Opções</h2>
              <p style="white-space: normal;">
                Para {{ field.input_type }}, defina a lista de opções (value + labels).
              </p>
            </ion-label>
          </ion-item>

          <ion-list>
            <ion-item *ngFor="let opt of options; let i = index">
              <ion-grid style="width:100%;">
                <ion-row>
                  <ion-col size="12">
                    <ion-label position="stacked">Value</ion-label>
                    <!-- ✅ ngModel evita o “1 caractere” -->
                    <ion-input [(ngModel)]="options[i].value" placeholder="ex: GOLD"></ion-input>
                  </ion-col>

                  <ion-col size="6">
                    <ion-label position="stacked">Label (pt)</ion-label>
                    <ion-input [(ngModel)]="optLabelPt[i]" placeholder="Ex: Ouro"></ion-input>
                  </ion-col>

                  <ion-col size="6">
                    <ion-label position="stacked">Label (en)</ion-label>
                    <ion-input [(ngModel)]="optLabelEn[i]" placeholder="Ex: Gold"></ion-input>
                  </ion-col>

                  <ion-col size="12" style="text-align:right;">
                    <ion-button fill="clear" color="danger" (click)="removeOption(i)">Remover opção</ion-button>
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-item>
          </ion-list>

          <ion-button expand="block" fill="outline" (click)="addOption()">
            + Adicionar opção
          </ion-button>

        </ng-container>
      </ng-container>

      <!-- ========================= STATIC ========================= -->
      <ng-container *ngIf="mode === 'STATIC'">

        <ion-item>
          <ion-label position="stacked">Tipo estático</ion-label>
          <ion-select [(ngModel)]="staticType" (ionChange)="onStaticTypeChange()">
            <ion-select-option value="TITLE">TITLE</ion-select-option>
            <ion-select-option value="SUBTITLE">SUBTITLE</ion-select-option>
            <ion-select-option value="TEXT_BLOCK">TEXT_BLOCK</ion-select-option>
            <ion-select-option value="DIVIDER">DIVIDER</ion-select-option>
            <ion-select-option value="IMAGE_DECORATIVE">IMAGE_DECORATIVE</ion-select-option>
          </ion-select>
        </ion-item>

        <ng-container *ngIf="staticType === 'TITLE' || staticType === 'SUBTITLE' || staticType === 'TEXT_BLOCK'">
          <ion-item>
            <ion-label position="stacked">Texto (pt)</ion-label>
            <ion-input [(ngModel)]="textPt"></ion-input>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Text (en)</ion-label>
            <ion-input [(ngModel)]="textEn"></ion-input>
          </ion-item>
        </ng-container>

        <ng-container *ngIf="staticType === 'IMAGE_DECORATIVE'">
          <ion-item>
            <ion-label position="stacked">URL da imagem</ion-label>
            <ion-input [(ngModel)]="imageUrl" placeholder="https://..."></ion-input>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Alt (pt)</ion-label>
            <ion-input [(ngModel)]="altPt"></ion-input>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Alt (en)</ion-label>
            <ion-input [(ngModel)]="altEn"></ion-input>
          </ion-item>
        </ng-container>

      </ng-container>

    </ion-content>
  `,
})
export class ElementEditorModal implements OnInit {
  @Input() element?: FormElement;

  isEdit = false;

  mode: 'FIELD' | 'STATIC' = 'FIELD';

  inputTypeOptions: InputType[] = [
    'TEXT',
    'TEXTAREA',
    'NUMBER',
    'DATE',
    'BOOL',
    'SELECT',
    'SINGLE_CHOICE',
    'MULTI_CHOICE',
    'PHOTO',
    'SIGNATURE',
    'DRAW_ON_IMAGE',
  ];

  // FIELD
  field: FieldElement = {
    type: 'FIELD',
    key: '',
    input_type: 'TEXT',
  };
  labelPt = '';
  labelEn = '';
  phPt = '';
  phEn = '';
  required = false;

  // DRAW_ON_IMAGE
  drawBackgroundUrl = '';

  options: FieldOption[] = [];
  // para facilitar binding dos labels (evitar mexer no objeto a cada tecla)
  optLabelPt: string[] = [];
  optLabelEn: string[] = [];

  // STATIC
  staticType: StaticType = 'TITLE';
  textPt = '';
  textEn = '';
  imageUrl = '';
  altPt = '';
  altEn = '';

  constructor(private modalCtrl: ModalController) {}

  ngOnInit() {
    this.isEdit = !!this.element;

    if (!this.element) {
      // defaults
      this.mode = 'FIELD';
      this.syncLabelsFromField();
      return;
    }

    if ((this.element as any).type === 'FIELD') {
      this.mode = 'FIELD';
      const el = this.element as FieldElement;
      this.field = {
        type: 'FIELD',
        key: el.key ?? '',
        input_type: el.input_type ?? 'TEXT',
        label: el.label,
        placeholder: el.placeholder,
        options: el.options,
        rules: el.rules,
        photo_purpose: el.photo_purpose,
        draw_on_image: (el as any).draw_on_image,
      };

      this.drawBackgroundUrl = ((el as any).draw_on_image?.background_url ?? '').toString();

      this.labelPt = (el.label && el.label['pt']) ? String(el.label['pt']) : '';
      this.labelEn = (el.label && el.label['en']) ? String(el.label['en']) : '';
      this.phPt = (el.placeholder && el.placeholder['pt']) ? String(el.placeholder['pt']) : '';
      this.phEn = (el.placeholder && el.placeholder['en']) ? String(el.placeholder['en']) : '';
      this.required = !!el.rules?.required;

      this.options = Array.isArray(el.options) ? el.options.map(o => ({
        value: String(o.value ?? ''),
        label: o.label ? { ...o.label } : undefined,
      })) : [];

      this.rebuildOptionLabelBuffers();
    } else {
      this.mode = 'STATIC';
      const st = this.element as StaticElement;
      this.staticType = st.type;

      if (st.type === 'TITLE' || st.type === 'SUBTITLE' || st.type === 'TEXT_BLOCK') {
        const t = st.text as LocalizedText;
        this.textPt = t?.['pt'] ? String(t['pt']) : '';
        this.textEn = t?.['en'] ? String(t['en']) : '';
      }

      if (st.type === 'IMAGE_DECORATIVE') {
        this.imageUrl = (st.url ?? '').toString();
        const alt = st.alt;
        this.altPt = alt?.['pt'] ? String(alt['pt']) : '';
        this.altEn = alt?.['en'] ? String(alt['en']) : '';
      }
    }
  }

  close() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  confirm() {
    if (this.mode === 'FIELD') {
      // monta label/placeholder
      const label = this.makeLocalized(this.labelPt, this.labelEn);
      const placeholder = this.makeLocalized(this.phPt, this.phEn);

      const rules: FieldRules = { ...(this.field.rules || {}) };
      if (this.required) rules.required = true;
      else delete rules.required;

      // injeta labels de options nos objetos
      if (this.needsOptions(this.field.input_type)) {
        this.options = (this.options || []).map((o, i) => {
          const pt = (this.optLabelPt[i] ?? '').trim();
          const en = (this.optLabelEn[i] ?? '').trim();
          const lbl = this.makeLocalized(pt, en);
          return {
            value: (o.value ?? '').toString(),
            label: lbl || undefined,
          };
        });
      } else {
        this.options = [];
      }

      const built: FieldElement = {
        type: 'FIELD',
        key: (this.field.key ?? '').toString(),
        input_type: this.field.input_type,
        ...(label ? { label } : {}),
        ...(placeholder ? { placeholder } : {}),
        ...(this.needsOptions(this.field.input_type) ? { options: this.options } : {}),
        ...(Object.keys(rules).length ? { rules } : {}),
        ...(this.field.photo_purpose ? { photo_purpose: this.field.photo_purpose } : {}),
        ...(this.field.input_type === 'DRAW_ON_IMAGE'
          ? { draw_on_image: { background_url: (this.drawBackgroundUrl || '').trim() } }
          : {}),
      };

      this.modalCtrl.dismiss(built, 'confirm');
      return;
    }

    // STATIC
    const st = this.buildStatic();
    this.modalCtrl.dismiss(st, 'confirm');
  }

  onModeChange() {
    if (this.mode === 'FIELD') {
      this.field = { type: 'FIELD', key: '', input_type: 'TEXT' };
      this.labelPt = '';
      this.labelEn = '';
      this.phPt = '';
      this.phEn = '';
      this.required = false;
      this.options = [];
      this.optLabelPt = [];
      this.optLabelEn = [];
      this.drawBackgroundUrl = '';
    } else {
      this.staticType = 'TITLE';
      this.textPt = '';
      this.textEn = '';
      this.imageUrl = '';
      this.altPt = '';
      this.altEn = '';
    }
  }

  onFieldTypeChange() {
    if (!this.needsOptions(this.field.input_type)) {
      this.options = [];
      this.optLabelPt = [];
      this.optLabelEn = [];
    } else if (!this.options.length) {
      this.addOption();
    }

    if (this.field.input_type !== 'DRAW_ON_IMAGE') {
      this.drawBackgroundUrl = '';
    }
  }

  onStaticTypeChange() {
    // limpa campos conforme tipo
    if (this.staticType === 'DIVIDER') {
      this.textPt = '';
      this.textEn = '';
      this.imageUrl = '';
      this.altPt = '';
      this.altEn = '';
    }
    if (this.staticType === 'IMAGE_DECORATIVE') {
      this.textPt = '';
      this.textEn = '';
    }
  }

  needsOptions(t: InputType) {
    return t === 'SELECT' || t === 'SINGLE_CHOICE' || t === 'MULTI_CHOICE';
  }

  addOption() {
    this.options.push({ value: '' });
    this.optLabelPt.push('');
    this.optLabelEn.push('');
  }

  removeOption(i: number) {
    this.options.splice(i, 1);
    this.optLabelPt.splice(i, 1);
    this.optLabelEn.splice(i, 1);
  }

  private rebuildOptionLabelBuffers() {
    this.optLabelPt = this.options.map(o => (o.label?.['pt'] ? String(o.label['pt']) : ''));
    this.optLabelEn = this.options.map(o => (o.label?.['en'] ? String(o.label['en']) : ''));
  }

  private makeLocalized(pt: string, en: string): LocalizedText | null {
    const p = (pt ?? '').trim();
    const e = (en ?? '').trim();
    if (!p && !e) return null;
    const out: LocalizedText = {};
    if (p) out['pt'] = p;
    if (e) out['en'] = e;
    return out;
  }

  private syncLabelsFromField() {
    this.labelPt = '';
    this.labelEn = '';
    this.phPt = '';
    this.phEn = '';
    this.required = false;
  }

  private buildStatic(): StaticElement {
    if (this.staticType === 'DIVIDER') {
      return { type: 'DIVIDER' };
    }

    if (this.staticType === 'IMAGE_DECORATIVE') {
      const alt = this.makeLocalized(this.altPt, this.altEn);
      return {
        type: 'IMAGE_DECORATIVE',
        url: (this.imageUrl || '').trim(),
        ...(alt ? { alt } : {}),
      };
    }

    // TITLE / SUBTITLE / TEXT_BLOCK
    const text = this.makeLocalized(this.textPt, this.textEn) || { pt: '', en: '' };
    return {
      type: this.staticType,
      text,
    } as StaticElement;
  }
}
