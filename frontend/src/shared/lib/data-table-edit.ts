import type { ReactNode } from 'react';
import type { InlineFieldEditor, InlineFieldValue } from '../ui/InlineField';

export type DataTableEditValues = Record<string, InlineFieldValue>;
/** Intermediate input may be invalid (for example an unfinished numeric value). */
export type DataTableEditDraft<V extends DataTableEditValues> = {
  [K in keyof V]: InlineFieldValue;
};
export type DataTableEditIssue = 'required' | 'invalid';
export type DataTableEditSubmission<T, V extends DataTableEditValues> = {
  row: T;
  changes: Readonly<Partial<V>>;
  values: Readonly<V>;
};
export type DataTableEditField<T, V extends DataTableEditValues> = {
  editor:
    InlineFieldEditor | ((values: Readonly<DataTableEditDraft<V>>, row: T) => InlineFieldEditor);
  required?: boolean | ((values: Readonly<DataTableEditDraft<V>>, row: T) => boolean);
  dependsOn?: readonly (keyof V & string)[];
  /** Explicit reset value; null and empty text have different storage meanings. */
  clearValue?:
    InlineFieldValue | ((values: Readonly<DataTableEditDraft<V>>, row: T) => InlineFieldValue);
  canEdit?: (values: Readonly<DataTableEditDraft<V>>, row: T) => boolean;
  unavailableReason?: (values: Readonly<DataTableEditDraft<V>>, row: T) => string | undefined;
};
export type DataTableEditGroup<T, V extends DataTableEditValues> = {
  fields: { [K in keyof V]: DataTableEditField<T, V> };
  /** Return null for rows to which this editable group does not apply. */
  read: (row: T) => V | null;
  save: (submission: DataTableEditSubmission<T, V>) => Promise<void>;
  validate?: (values: Readonly<DataTableEditDraft<V>>, row: T) => boolean;
  /** Only a feature which reconciles server state itself should discard failed drafts. */
  failure?: 'retain' | 'discard';
  /** Presentation only: cross-row business projections never enter the saved draft. */
  display?: (
    row: T,
    values: Readonly<DataTableEditDraft<V>>,
    pending?: DataTableEditSubmission<T, V>,
  ) => DataTableEditDraft<V>;
};
export type DataTableCellEditing<T> = {
  render: (row: T, label: string, rowId: string | number) => ReactNode | undefined;
};
export type DataTableEditCopy = {
  edit: (label: string) => string;
  clear: (label: string) => string;
  empty: string;
  required: string;
  invalid: string;
  incomplete: string;
  saving: string;
  failed: string;
  conflict: string;
  retry: string;
  cancel: string;
  readonly: string;
};

/** Validate dependency declarations and order parents before descendants, regardless of column order.
 * A dependent must declare its reset value. Cycles/unknown fields are configuration errors,
 * never silently ignored because that could persist a stale foreign-key relationship.
 * @author ZhengLee 2026.10.16
 */
export function editFieldOrder<T, V extends DataTableEditValues>(
  fields: DataTableEditGroup<T, V>['fields'],
) {
  const ordered: (keyof V & string)[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (field: keyof V & string) => {
    if (!Object.hasOwn(fields, field)) throw new Error('Unknown edit dependency.');
    if (visiting.has(field)) throw new Error('Cyclic edit dependencies.');
    if (visited.has(field)) return;
    const definition = fields[field];
    if (definition.dependsOn?.length && definition.clearValue === undefined)
      throw new Error('Dependent edit fields require an explicit clearValue.');
    visiting.add(field);
    for (const parent of definition.dependsOn ?? []) visit(parent);
    visiting.delete(field);
    visited.add(field);
    ordered.push(field);
  };
  for (const field of Object.keys(fields)) visit(field);
  if (!ordered.length) throw new Error('An edit group requires fields.');
  return ordered;
}

/** Apply one input and clear every transitive descendant before validation or saving. */
export function changeEditDraft<T, V extends DataTableEditValues>(
  group: DataTableEditGroup<T, V>,
  row: T,
  draft: Readonly<DataTableEditDraft<V>>,
  field: keyof V & string,
  value: InlineFieldValue,
): DataTableEditDraft<V> {
  const order = editFieldOrder(group.fields);
  if (!Object.hasOwn(group.fields, field)) throw new Error('Unknown editable field.');
  if (Object.is(draft[field], value)) return { ...draft };
  const next = { ...draft, [field]: value };
  const affected = new Set<string>([field]);
  for (const key of order) {
    const definition = group.fields[key];
    if (key !== field && definition.dependsOn?.some((parent) => affected.has(parent))) {
      next[key] =
        typeof definition.clearValue === 'function'
          ? definition.clearValue(next, row)
          : definition.clearValue!;
      affected.add(key);
    }
  }
  return next;
}

/** Validate the complete group. False and zero are values; required never means truthy.
 * Editor types, nullability, options and custom rules are checked before creating a PATCH.
 */
export function validateEditDraft<T, V extends DataTableEditValues>(
  group: DataTableEditGroup<T, V>,
  row: T,
  values: Readonly<DataTableEditDraft<V>>,
) {
  const issues: Partial<Record<keyof V, DataTableEditIssue>> = {};
  for (const key of Object.keys(group.fields) as (keyof V & string)[]) {
    const definition = group.fields[key];
    const editor =
      typeof definition.editor === 'function' ? definition.editor(values, row) : definition.editor;
    const required =
      typeof definition.required === 'function'
        ? definition.required(values, row)
        : definition.required;
    const value = values[key];
    if (required && (value === null || (typeof value === 'string' && !value.trim()))) {
      issues[key] = 'required';
      continue;
    }
    let valid =
      value === null
        ? !!editor.nullable
        : editor.type === 'boolean'
          ? typeof value === 'boolean'
          : editor.type === 'number'
            ? typeof value === 'number' && Number.isFinite(value)
            : editor.type === 'select'
              ? !!editor.options?.some((option) => Object.is(option.value, value))
              : editor.type === 'searchable-select'
                ? !!editor.selection &&
                  (typeof value === 'string' ||
                    (typeof value === 'number' && Number.isFinite(value))) &&
                  ('options' in editor.selection.source
                    ? editor.selection.source.options.some(
                        (option) => Object.is(option.value, value) && !option.disabled,
                      )
                    : true)
                : typeof value === 'string' &&
                  (editor.maxLength === undefined || value.length <= editor.maxLength);
    try {
      if (editor.validate?.(value) === false) valid = false;
    } catch {
      valid = false;
    }
    if (!valid) issues[key] = 'invalid';
  }
  let valid = Object.keys(issues).length === 0;
  try {
    if (valid && group.validate?.(values, row) === false) valid = false;
  } catch {
    valid = false;
  }
  return { valid, issues };
}

/** Whitelist changes using declared fields only. Call after validateEditDraft succeeds. */
export function editDraftChanges<T, V extends DataTableEditValues>(
  group: DataTableEditGroup<T, V>,
  baseline: Readonly<V>,
  values: Readonly<DataTableEditDraft<V>>,
): Partial<V> {
  return Object.fromEntries(
    Object.keys(group.fields)
      .filter((field) => !Object.is(values[field], baseline[field]))
      .map((field) => [field, values[field]]),
  ) as Partial<V>;
}
