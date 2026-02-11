import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';

import {
  FormElement,
  FieldElement,
  FieldOption,
  InputType,
  LocalizedText,
} from 'src/app/components/form-renderer/form-renderer.types';

type Mode = 'create' | 'edit';

@Component({
  selector: 'app-element-editor-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ mode === 'edit' ? 'Editar elemento' : 'Novo elemento' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" (click)="cancel()">Cancelar</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-list>
        <ion-item>
          <ion-label>Tipo</ion-label>
          <ion-select
            interface="popover"
            [disabled]="mode === 'edit'"
            [value]="type"
            (ionChange)="onTypeChange($event.detail.value)"
          >
            <ion-select-option value="FIELD">Campo (FIELD)</ion-select-option>
            <ion-select-option value="TITLE">Título</ion-select-option>
            <ion-select-option value="SUBTITLE">Subtítulo</ion-select-option>
            <ion-select-option value="TEXT_BLOCK">Texto</ion-select-option>
            <ion-select-option value="DIVIDER">Divisor</ion-select-option>
            <ion-select-option value="IMAGE_DECORATIVE">Imagem decorativa</ion-select-option>
          </ion-select>
        </ion-item>

        <!-- ===================== FIELD ===================== -->
        <ng-container *ngIf="type === 'FIELD'">
          <ion-item>
            <ion-label position="stacked">Key</ion-label>
            <ion-input
              [value]="fieldKey"
              (ionInput)="fieldKey = ($event.detail.value ?? '').toString()"
              placeholder="ex: customer_name"
            ></ion-input>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Input Type</ion-label>
            <ion-select
              interface="popover"
              [value]="fieldInputType"
              (ionChange)="onInputTypeChange($event.detail.value)"
            >
              <ion-select-option *ngFor="let it of inputTypeOptions" [value]="it">
                {{ it }}
              </ion-select-option>
            </ion-select>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Label (pt)</ion-label>
            <ion-input
              [value]="labelPt"
              (ionInput)="labelPt = ($event.detail.value ?? '').toString()"
              placeholder="Ex: Nome"
            ></ion-input>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Label (en)</ion-label>
            <ion-input
              [value]="labelEn"
              (ionInput)="labelEn = ($event.detail.value ?? '').toString()"
              placeholder="Ex: Name"
            ></ion-input>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Placeholder (pt)</ion-label>
            <ion-input
              [value]="placeholderPt"
              (ionInput)="placeholderPt = ($event.detail.value ?? '').toString()"
              placeholder="Ex: Digite seu nome"
            ></ion-input>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Placeholder (en)</ion-label>
            <ion-input
              [value]="placeholderEn"
              (ionInput)="placeholderEn = ($event.detail.value ?? '').toString()"
              placeholder="Ex: Type your name"
            ></ion-input>
          </ion-item>

          <ion-item lines="full">
            <ion-label>Obrigatório</ion-label>
            <ion-toggle
              slot="end"
              [checked]="required"
              (ionChange)="required = !!$event.detail.checked"
            ></ion-toggle>
          </ion-item>

          <!-- OPTIONS only for SELECT / SINGLE_CHOICE / MULTI_CHOICE -->
          <ng-container *ngIf="needsOptions(fieldInputType)">
            <ion-item lines="none">
              <ion-label>
                <h2>Opções</h2>
                <p style="white-space: normal;">
                  Para {{ fieldInputType }}, defina a lista de opções (value + labels).
                </p>
              </ion-label>
            </ion-item>

            <ion-list>
              <ion-item *ngFor="let opt of options; let i = index">
                <ion-grid style="width:100%;">
                  <ion-row>
                    <ion-col size="12">
                      <ion-label position="stacked">Value</ion-label>
                      <ion-input
                        [value]="opt.value"
                        (ionInput)="setOptionValue(i, ($event.detail.value ?? '').toString())"
                        placeholder="ex: GOLD"
                      ></ion-input>
                    </ion-col>

                    <ion-col size="6">
                      <ion-label position="stacked">Label (pt)</ion-label>
                      <ion-input
                        [value]="getOptLabel(opt, 'pt')"
                        (ionInput)="setOptionLabel(i, 'pt', ($event.detail.value ?? '').toString())"
                        placeholder="Ex: Ouro"
                      ></ion-input>
                    </ion-col>

                    <ion-col size="6">
                      <ion-label position="stacked">Label (en)</ion-label>
                      <ion-input
                        [value]="getOptLabel(opt, 'en')"
                        (ionInput)="setOptionLabel(i, 'en', ($event.detail.value ?? '').toString())"
                        placeholder="Ex: Gold"
                      ></ion-input>
                    </ion-col>

                    <ion-col size="12" class="ion-text-right">
                      <ion-button fill="clear" color="danger" (click)="removeOption(i)">
                        Remover opção
                      </ion-button>
                    </ion-col>
                  </ion-row>
                </ion-grid>
              </ion-item>

              <ion-item lines="none">
                <ion-button expand="block" fill="outline" (click)="addOption()">
                  + Adicionar opção
                </ion-button>
              </ion-item>
            </ion-list>
          </ng-container>
        </ng-container>

        <!-- ===================== TEXT/TITLE/SUBTITLE ===================== -->
        <ng-container *ngIf="type === 'TITLE' || type === 'SUBTITLE' || type === 'TEXT_BLOCK'">
          <ion-item>
            <ion-label position="stacked">Texto (pt)</ion-label>
            <ion-input
              [value]="textPt"
              (ionInput)="textPt = ($event.detail.value ?? '').toString()"
            ></ion-input>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Texto (en)</ion-label>
            <ion-input
              [value]="textEn"
              (ionInput)="textEn = ($event.detail.value ?? '').toString()"
            ></ion-input>
          </ion-item>
        </ng-container>

        <!-- ===================== IMAGE_DECORATIVE ===================== -->
        <ng-container *ngIf="type === 'IMAGE_DECORATIVE'">
          <ion-item>
            <ion-label position="stacked">URL da imagem</ion-label>
            <ion-input
              [value]="imageUrl"
              (ionInput)="imageUrl = ($event.detail.value ?? '').toString()"
              placeholder="https://..."
            ></ion-input>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Alt (pt)</ion-label>
            <ion-input
              [value]="altPt"
              (ionInput)="altPt = ($event.detail.value ?? '').toString()"
            ></ion-input>
          </ion-item>

          <ion-item>
            <ion-label position="stacked">Alt (en)</ion-label>
            <ion-input
              [value]="altEn"
              (ionInput)="altEn = ($event.detail.value ?? '').toString()"
            ></ion-input>
          </ion-item>
        </ng-container>

        <!-- ===================== DIVIDER ===================== -->
        <ng-container *ngIf="type === 'DIVIDER'">
          <ion-item>
            <ion-label>
              <h2>Divisor</h2>
              <p>Nenhum campo adicional.</p>
            </ion-label>
          </ion-item>
        </ng-container>
      </ion-list>

      <div style="height: 12px;"></div>

      <ion-button expand="block" (click)="save()">
        Salvar elemento
      </ion-button>
    </ion-content>
  `,
})
export class ElementEditorModal implements OnInit {
  @Input() mode: Mode = 'create';
  @Input() element?: FormElement;

  // UI state
  type: FormElement['type'] = 'FIELD';

  // FIELD fields
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
  ];

  fieldKey = '';
  fieldInputType: InputType = 'TEXT';
  labelPt = '';
  labelEn = '';
  placeholderPt = '';
  placeholderEn = '';
  required = false;

  options: FieldOption[] = [];

  // STATIC text
  textPt = '';
  textEn = '';

  // IMAGE_DECORATIVE
  imageUrl = '';
  altPt = '';
  altEn = '';

  constructor(private modalCtrl: ModalController) {}

  ngOnInit(): void {
    if (!this.element) return;

    this.type = this.element.type;

    if (this.type === 'FIELD') {
      const f = this.element as FieldElement;
      this.fieldKey = (f.key ?? '').toString();
      this.fieldInputType = (f.input_type ?? 'TEXT') as InputType;

      const lbl = f.label || {};
      this.labelPt = (lbl['pt'] ?? '').toString();
      this.labelEn = (lbl['en'] ?? '').toString();

      const ph = f.placeholder || {};
      this.placeholderPt = (ph['pt'] ?? '').toString();
      this.placeholderEn = (ph['en'] ?? '').toString();

      this.required = !!(f.rules && f.rules.required);
      this.options = Array.isArray(f.options) ? [...f.options] : [];
    }

    if (this.type === 'TITLE' || this.type === 'SUBTITLE' || this.type === 'TEXT_BLOCK') {
      const st: any = this.element;
      const t: LocalizedText = st.text || {};
      this.textPt = (t['pt'] ?? '').toString();
      this.textEn = (t['en'] ?? '').toString();
    }

    if (this.type === 'IMAGE_DECORATIVE') {
      const img: any = this.element;
      this.imageUrl = (img.url ?? '').toString();

      const alt: LocalizedText = img.alt || {};
      this.altPt = (alt['pt'] ?? '').toString();
      this.altEn = (alt['en'] ?? '').toString();
    }
  }

  cancel() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  onTypeChange(v: any) {
    this.type = v as any;

    // reset some fields when switching type
    if (this.type !== 'FIELD') {
      this.fieldKey = '';
      this.fieldInputType = 'TEXT';
      this.labelPt = '';
      this.labelEn = '';
      this.placeholderPt = '';
      this.placeholderEn = '';
      this.required = false;
      this.options = [];
    }
  }

  onInputTypeChange(v: any) {
    this.fieldInputType = (v as InputType) || 'TEXT';

    // if type doesn't use options, drop them
    if (!this.needsOptions(this.fieldInputType)) {
      this.options = [];
    } else if (!Array.isArray(this.options)) {
      this.options = [];
    }
  }

  needsOptions(inputType: InputType): boolean {
    return inputType === 'SELECT' || inputType === 'SINGLE_CHOICE' || inputType === 'MULTI_CHOICE';
  }

  addOption() {
    this.options = [...(this.options || []), { value: '', label: { pt: '', en: '' } }];
  }

  removeOption(i: number) {
    this.options = (this.options || []).filter((_, idx) => idx !== i);
  }

  setOptionValue(i: number, value: string) {
    const opts = [...(this.options || [])];
    const cur = opts[i] || { value: '', label: {} };
    opts[i] = { ...cur, value };
    this.options = opts;
  }

  getOptLabel(opt: FieldOption, lang: 'pt' | 'en'): string {
    const lbl = opt.label || {};
    return (lbl[lang] ?? '').toString();
  }

  setOptionLabel(i: number, lang: 'pt' | 'en', value: string) {
    const opts = [...(this.options || [])];
    const cur = opts[i] || { value: '', label: {} };
    const lbl = { ...(cur.label || {}) };
    lbl[lang] = value;

    opts[i] = { ...cur, label: lbl };
    this.options = opts;
  }

  private buildLocalized(pt: string, en: string): LocalizedText | undefined {
    const p = (pt || '').trim();
    const e = (en || '').trim();
    if (!p && !e) return undefined;
    return { pt: p, en: e };
  }

  save() {
    const id = this.ensureId(this.element);

    if (this.type === 'FIELD') {
      const key = (this.fieldKey || '').trim();
      const input_type = this.fieldInputType || 'TEXT';

      const label = this.buildLocalized(this.labelPt, this.labelEn);
      const placeholder = this.buildLocalized(this.placeholderPt, this.placeholderEn);

      const rules = this.required ? { required: true } : undefined;

      const needs = this.needsOptions(input_type);
      const options = needs ? (this.options || []).map(o => ({
        value: (o.value ?? '').toString(),
        label: o.label ? { ...o.label } : undefined,
      })) : undefined;

      const el: any = {
        id,
        type: 'FIELD',
        key,
        input_type,
        label,
        placeholder,
        rules,
        options,
      } satisfies any;

      this.modalCtrl.dismiss(el as FormElement, 'ok');
      return;
    }

    if (this.type === 'TITLE' || this.type === 'SUBTITLE' || this.type === 'TEXT_BLOCK') {
      const text = this.buildLocalized(this.textPt, this.textEn) || { pt: '', en: '' };
      const st: any = { id, type: this.type, text };
      this.modalCtrl.dismiss(st as FormElement, 'ok');
      return;
    }

    if (this.type === 'IMAGE_DECORATIVE') {
      const url = (this.imageUrl || '').trim();
      const alt = this.buildLocalized(this.altPt, this.altEn);
      const img: any = { id, type: 'IMAGE_DECORATIVE', url, alt };
      this.modalCtrl.dismiss(img as FormElement, 'ok');
      return;
    }

    // DIVIDER
    const div: any = { id, type: 'DIVIDER' };
    this.modalCtrl.dismiss(div as FormElement, 'ok');
  }

  // teu schema usa id opcional (no renderer.types não tem, mas teu builder provavelmente usa)
  private ensureId(el?: FormElement): string {
    const anyEl: any = el as any;
    return (anyEl && anyEl.id) ? String(anyEl.id) : this.genId();
  }

  private genId(): string {
    return 'el_' + Math.random().toString(36).slice(2, 10);
  }
}
