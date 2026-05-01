import type { FrontmatterFieldSchema } from '../../api';

export type FieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'string[]';

export type WidgetKind =
  | 'toggle'
  | 'text-input'
  | 'textarea'
  | 'slider'
  | 'stepper'
  | 'pill-select'
  | 'search-select'
  | 'date-picker'
  | 'tag-chips';

export interface UIHints {
  widget?: WidgetKind;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  placeholder?: string;
  collapsed?: boolean;
  group?: string;
}

export type ConditionalOp = 'eq' | 'neq' | 'truthy' | 'falsy';

export interface ConditionalRule {
  field: string;
  op: ConditionalOp;
  value?: unknown;
}

export interface FieldSchema {
  type: FieldType;
  label?: string;
  description?: string;
  required?: boolean;
  options?: string[];
  showWhen?: ConditionalRule;
  ui?: UIHints;
}

export interface FieldEntry {
  name: string;
  schema: FieldSchema;
}

export function adaptLegacyFields(
  legacy: FrontmatterFieldSchema[],
): FieldEntry[] {
  return legacy.map((f) => ({
    name: f.name,
    schema: {
      type: f.type,
      label: f.label,
      description: f.description,
      required: f.required,
      options: f.options,
      ui: f.placeholder ? { placeholder: f.placeholder } : undefined,
    },
  }));
}

export function getFieldValue(
  values: Record<string, unknown>,
  path: string,
): unknown {
  return values[path];
}

export function evaluateCondition(
  rule: ConditionalRule,
  values: Record<string, unknown>,
): boolean {
  const v = getFieldValue(values, rule.field);
  switch (rule.op) {
    case 'eq':
      return v === rule.value;
    case 'neq':
      return v !== rule.value;
    case 'truthy':
      return Boolean(v);
    case 'falsy':
      return !v;
  }
}
