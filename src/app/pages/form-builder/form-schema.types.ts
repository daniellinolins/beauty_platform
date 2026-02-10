import { FormElement, LocalizedText } from 'src/app/components/form-renderer/form-renderer.types';

export type FormSection = {
  id: string;
  title?: LocalizedText;
  elements: FormElement[];
};

export type FormSchema = {
  schema_version: 'v1';
  default_language: string;
  sections: FormSection[];
};

export function makeEmptySchema(defaultLanguage: string): FormSchema {
  return {
    schema_version: 'v1',
    default_language: defaultLanguage,
    sections: [
      {
        id: `sec_${Date.now()}`,
        title: { [defaultLanguage]: 'Seção 1' },
        elements: [],
      },
    ],
  };
}
