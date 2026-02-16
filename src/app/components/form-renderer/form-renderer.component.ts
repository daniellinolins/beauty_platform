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
import { DrawOnImageComponent } from '../draw-on-image/draw-on-image.component';

import {
  FieldOption,
  FormElement,
  LocalizedText,
  UiLang,
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
    DrawOnImageComponent,
  ],
  templateUrl: './form-renderer.component.html',
})
export class FormRendererComponent {
  @Input() mode: 'fill' | 'preview' | 'edit' = 'fill';

  @Input() tenantId: number = 1;

  /**
   * Preferred UI language/locale.
   *
   * The builder/preview may send either locale codes ("pt-PT" | "en-US")
   * or short language codes ("pt" | "en").
   *
   * Keep this input for backward compatibility.
   */
  @Input() defaultLang: UiLang | string = 'pt-PT';

  /**
   * Optional legacy/alternative language input.
   * If provided, it takes precedence over `defaultLang`.
   */
  @Input() language?: UiLang | string;

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

  getDrawOnImageBackgroundUrl(e: FormElement): string {
    if (e.type !== 'FIELD') return '';
    const cfg = (e as any).draw_on_image;
    return (cfg?.background_url ?? '').toString();
  }

  isRequired(e: FormElement): boolean {
    if (e.type !== 'FIELD') return false;
    return !!((e as any).rules && (e as any).rules.required);
  }

  /**
   * Robust localized text resolver.
   * Supports keys like: pt/en, pt-PT/pt-BR, en-US/en-GB, etc.
   */
  getTextLocalized(t: LocalizedText | null | undefined): string {
    if (!t) return '';

    // 1) Try preferred language keys (ordered)
    for (const k of this.getPreferredLangKeys()) {
      const v = t[k];
      if (typeof v === 'string' && v.trim().length) return v;
    }

    // 2) Try a few common fallbacks explicitly
    const commonFallbacks = ['pt', 'pt-PT', 'pt-BR', 'en', 'en-US', 'en-GB'];
    for (const k of commonFallbacks) {
      const v = t[k];
      if (typeof v === 'string' && v.trim().length) return v;
    }

    // 3) Last resort: first non-empty value
    for (const v of Object.values(t)) {
      if (typeof v === 'string' && v.trim().length) return v;
    }
    return '';
  }

  /**
   * Preferred key order derived from `language` (if provided) or `defaultLang`.
   */
  private getPreferredLangKeys(): string[] {
    const raw = (this.language ?? this.defaultLang ?? '').toString().trim();
    const s = raw.toLowerCase();

    // Normalize some common variations
    const normalized = s.replace('_', '-');
    const base = normalized.split('-')[0];

    // Always try the exact raw value first
    const keys: string[] = [];
    if (raw) keys.push(raw);
    if (normalized && normalized !== raw) keys.push(normalized);

    // Expand by language family
    if (base === 'en') {
      keys.push('en-US', 'en-GB', 'en');
    } else if (base === 'pt') {
      keys.push('pt-PT', 'pt-BR', 'pt');
    } else if (base) {
      keys.push(base);
    }

    return Array.from(new Set(keys)).filter(Boolean);
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
