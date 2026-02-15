export type LocalizedText = Record<string, string>;

/**
 * Supported language codes used by the Form Builder UI.
 *
 * Notes:
 * - The builder sometimes stores short codes ("pt" | "en").
 * - The mobile UI often uses locale codes ("pt-PT" | "en-US").
 */
export type UiLang = 'pt' | 'en' | 'pt-PT' | 'pt-BR' | 'en-US' | 'en-GB';

export type InputType =
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

export type FieldOption = {
  value: string;
  label?: LocalizedText;
};

export type FieldRules = {
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  regex?: string;
};

export type FieldElement = {
  type: 'FIELD';
  key: string;
  label?: LocalizedText;
  input_type: InputType;
  placeholder?: LocalizedText;
  options?: FieldOption[];
  rules?: FieldRules;
  photo_purpose?: string;
};

export type StaticElement =
  | { type: 'TITLE' | 'SUBTITLE' | 'TEXT_BLOCK'; text: LocalizedText }
  | { type: 'DIVIDER' }
  | { type: 'IMAGE_DECORATIVE'; url: string; alt?: LocalizedText };

export type FormElement = FieldElement | StaticElement;
