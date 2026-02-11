import type { FormElement, LocalizedText } from 'src/app/components/form-renderer/form-renderer.types';

// ✅ re-export para permitir: import { FormElement, LocalizedText } from './form-schema.types'
export type { FormElement, LocalizedText };

export interface FormSection {
  id: string;
  title?: LocalizedText;
  elements: FormElement[];
}

export interface FormSchema {
  schema_version: 'v1';
  default_language: string;
  sections: FormSection[];
}

export function makeEmptySchema(defaultLanguage: string = 'pt'): FormSchema {
  return {
    schema_version: 'v1',
    default_language: defaultLanguage,
    sections: [
      {
        id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
        title: { pt: 'Seção 1', en: 'Section 1' } as LocalizedText,
        elements: [],
      },
    ],
  };
}
