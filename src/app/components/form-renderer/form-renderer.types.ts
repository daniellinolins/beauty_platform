export type LocalizedText = Record<string, string>;

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
