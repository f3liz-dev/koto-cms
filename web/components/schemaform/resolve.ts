import type { FieldSchema, WidgetKind } from './schema';

export function resolveWidget(schema: FieldSchema): WidgetKind {
  const hint = schema.ui?.widget;
  if (hint) return hint;
  switch (schema.type) {
    case 'boolean':
      return 'toggle';
    case 'text':
      return 'textarea';
    case 'date':
      return 'date-picker';
    case 'string[]':
      return 'tag-chips';
    case 'number':
      if (schema.ui?.min !== undefined && schema.ui?.max !== undefined) {
        return 'slider';
      }
      return 'text-input';
    case 'string':
      if (schema.options?.length) {
        return schema.options.length > 5 ? 'search-select' : 'pill-select';
      }
      return 'text-input';
    default:
      return 'text-input';
  }
}
