import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  IonButton,
  IonItem,
  IonLabel,
  IonInput,
  IonTextarea,
  IonToggle,
  IonSelect,
  IonSelectOption,
  IonRadioGroup,
  IonRadio,
  IonCheckbox,
  IonList,
  IonDatetime,
  IonDatetimeButton,
  IonModal,
} from '@ionic/angular/standalone';

import { PhotoCaptureComponent } from '../photo-capture/photo-capture.component';
import { SignaturePadComponent } from '../signature-pad/signature-pad.component';

import {
  FieldOption,
  FormElement,
  LocalizedText,
} from './form-renderer.types';

@Component({
  selector: 'app-form-renderer',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonItem,
    IonLabel,
    IonInput,
    IonTextarea,
    IonToggle,
    IonSelect,
    IonSelectOption,
    IonRadioGroup,
    IonRadio,
    IonCheckbox,
    IonList,
    IonDatetime,
    IonDatetimeButton,
    IonModal,
    PhotoCaptureComponent,
    SignaturePadComponent,
  ],
  templateUrl: './form-renderer.component.html',
})
export class FormRendererComponent {
  @Input() mode: 'fill' | 'preview' | 'edit' = 'fill';

  @Input() tenantId: number = 1;
  @Input() defaultLang: string = 'pt-PT';

  @Input() elements: FormElement[] = [];
  @Input() payload: Record<string, any> = {};

  @Output() payloadChange = new EventEmitter<Record<string, any>>();

  canEdit(): boolean {
    return this.mode !== 'preview';
  }

  // -------------------------
  // Helpers: no template casting
  // -------------------------
  isTitle(e: FormElement): boolean {
    return e.type === 'TITLE';
  }
  isSubtitle(e: FormElement): boolean {
    return e.type === 'SUBTITLE';
  }
  isTextBlock(e: FormElement): boolean {
    return e.type === 'TEXT_BLOCK';
  }
  isImage(e: FormElement): boolean {
    return e.type === 'IMAGE_DECORATIVE';
  }
  isDivider(e: FormElement): boolean {
    return e.type === 'DIVIDER';
  }
  isField(e: FormElement): boolean {
    return e.type === 'FIELD';
  }

  getStaticText(e: FormElement): LocalizedText | null {
    if (e.type === 'TITLE' || e.type === 'SUBTITLE' || e.type === 'TEXT_BLOCK') {
      return (e as any).text || null;
    }
    return null;
  }

  getImageUrl(e: FormElement): string {
    if (e.type !== 'IMAGE_DECORATIVE') return '';
    return String((e as any).url || '');
  }

  getImageAlt(e: FormElement): LocalizedText | null {
    if (e.type !== 'IMAGE_DECORATIVE') return null;
    return (e as any).alt || null;
  }

  getKey(e: FormElement): string {
    if (e.type !== 'FIELD') return '';
    return (e as any).key || '';
  }

  getInputType(e: FormElement): string {
    if (e.type !== 'FIELD') return '';
    return (e as any).input_type || '';
  }

  getLabel(e: FormElement): LocalizedText | null {
    if (e.type !== 'FIELD') return null;
    return (e as any).label || null;
  }

  getPlaceholder(e: FormElement): LocalizedText | null {
    if (e.type !== 'FIELD') return null;
    return (e as any).placeholder || null;
  }

  getOptions(e: FormElement): FieldOption[] {
    if (e.type !== 'FIELD') return [];
    return (e as any).options || [];
  }

  isRequired(e: FormElement): boolean {
    if (e.type !== 'FIELD') return false;
    return !!((e as any).rules && (e as any).rules.required);
  }

  getTextLocalized(t: LocalizedText | null | undefined): string {
    if (!t) return '';
    return t[this.defaultLang] || t['pt-PT'] || t['pt-BR'] || Object.values(t)[0] || '';
  }

  // -------------------------
  // Payload handling
  // -------------------------
  getPayloadValue(key: string): any {
    if (!key) return null;
    return this.payload ? this.payload[key] : null;
  }

  setPayloadValue(key: string, value: any) {
    if (!key) return;
    this.payload = { ...(this.payload || {}), [key]: value };
    this.payloadChange.emit(this.payload);
  }

  // Choices helpers
  isCheckedMulti(key: string, optionValue: string): boolean {
    const cur = this.getPayloadValue(key);
    if (!Array.isArray(cur)) return false;
    return cur.includes(optionValue);
  }

  toggleMulti(key: string, optionValue: string, checked: boolean) {
    const cur = this.getPayloadValue(key);
    const arr = Array.isArray(cur) ? [...cur] : [];
    const exists = arr.includes(optionValue);

    if (checked && !exists) arr.push(optionValue);
    if (!checked && exists) {
      const idx = arr.indexOf(optionValue);
      if (idx >= 0) arr.splice(idx, 1);
    }

    this.setPayloadValue(key, arr);
  }
}
