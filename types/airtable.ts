export type AirtablePrimitive = string | number | boolean | null;
export type AirtableFieldValue = AirtablePrimitive | string[] | undefined;
export type AirtableFields = Record<string, AirtableFieldValue>;

export interface AirtableRecord<TFields extends AirtableFields = AirtableFields> {
  id: string;
  createdTime: string;
  fields: TFields;
}

export interface AirtableListResponse<TFields extends AirtableFields = AirtableFields> {
  records: AirtableRecord<TFields>[];
  offset?: string;
}

export interface AirtableErrorResponse {
  error?: {
    type?: string;
    message?: string;
  };
}
