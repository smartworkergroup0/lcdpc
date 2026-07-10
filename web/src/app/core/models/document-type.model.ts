export interface DocumentTypeOption {
  label: string;
  value: string;
}

export const DOCUMENT_TYPE_OPTIONS: DocumentTypeOption[] = [
  { label: 'V', value: 'V' },
  { label: 'E', value: 'E' },
  { label: 'J', value: 'J' },
  { label: 'G', value: 'G' },
  { label: 'C', value: 'C' },
  { label: 'P', value: 'P' },
];

export type DocumentType = 'V' | 'E' | 'J' | 'G' | 'C' | 'P';
