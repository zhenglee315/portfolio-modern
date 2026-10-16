import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  changeEditDraft,
  editDraftChanges,
  editFieldOrder,
  validateEditDraft,
  type DataTableCellEditing,
  type DataTableEditCopy,
  type DataTableEditDraft,
  type DataTableEditGroup,
  type DataTableEditSubmission,
  type DataTableEditValues,
} from '../lib/data-table-edit';
import type { InlineFieldValue } from '../ui/InlineField';
import { DataTableEditCell } from '../ui/DataTableEditCell';

type Key = string | number;
type Draft<V extends DataTableEditValues> = {
  baseline: V;
  values: DataTableEditDraft<V>;
  revision: number;
  attempted?: number;
  feedback: keyof V & string;
  phase: 'editing' | 'failed' | 'conflict';
};
type Store<T, V extends DataTableEditValues> = {
  scope: string;
  drafts: Map<Key, Draft<V>>;
  pending?: DataTableEditSubmission<T, V>;
};

/** Own atomic editable groups independently of APIs, query caches and business permissions.
 * Incomplete/invalid groups stay local. Saves only follow an explicit input completion,
 * never a render, validation effect or timer. Failed writes require a new edit or Retry.
 * Scope and submission identities keep late responses out of another account/page lifecycle.
 * @author ZhengLee 2026.10.16
 */
export function useDataTableEditGroup<T, V extends DataTableEditValues>({
  scope,
  group,
  rowKey,
  enabled = true,
  copy,
}: {
  scope: string;
  group: DataTableEditGroup<T, V>;
  rowKey: (row: T) => Key;
  enabled?: boolean;
  copy: DataTableEditCopy;
}) {
  const fields = useMemo(() => editFieldOrder(group.fields), [group.fields]);
  const empty = (): Store<T, V> => ({ scope, drafts: new Map() });
  const [store, setStore] = useState<Store<T, V>>(empty);
  const current = useRef(store);
  if (store.scope !== scope) setStore(empty());
  useEffect(() => {
    if (current.current.scope !== scope) current.current = { scope, drafts: new Map() };
    return () => {
      // A write can still commit after unmount; never let its response restore abandoned UI.
      current.current = { scope, drafts: new Map() };
    };
  }, [scope]);
  const rendered = store.scope === scope ? store : empty();
  const publish = (next: Store<T, V>) => {
    current.current = next;
    setStore(next);
  };
  const latest = () => (current.current.scope === scope ? current.current : empty());
  const read = (row: T): V | null => {
    const values = group.read(row);
    // Only declared editable fields can enter drafts or PATCH payloads.
    if (!values) return null;
    const declared = { ...values };
    for (const key of Object.keys(declared)) {
      if (!Object.hasOwn(group.fields, key)) delete declared[key];
    }
    return declared;
  };

  const change = (row: T, field: keyof V & string, value: InlineFieldValue) => {
    const state = latest();
    if (!enabled || state.pending) return;
    const baseline = read(row);
    if (!baseline || !Object.hasOwn(group.fields, field)) return;
    const key = rowKey(row);
    const previous = state.drafts.get(key);
    const values = previous?.values ?? baseline;
    if (group.fields[field].canEdit?.(values, row) === false || Object.is(values[field], value))
      return;
    const drafts = new Map(state.drafts);
    drafts.set(key, {
      baseline: previous?.baseline ?? baseline,
      values: changeEditDraft(group, row, values, field, value),
      revision: (previous?.revision ?? 0) + 1,
      feedback: field,
      phase: previous?.phase === 'conflict' ? 'conflict' : 'editing',
    });
    publish({ ...state, drafts });
  };
  const cancel = (row: T) => {
    const state = latest();
    if (state.pending && rowKey(state.pending.row) === rowKey(row)) return;
    const drafts = new Map(state.drafts);
    drafts.delete(rowKey(row));
    publish({ ...state, drafts });
  };
  const complete = async (row: T, field: keyof V & string, retry = false): Promise<boolean> => {
    const state = latest();
    const key = rowKey(row);
    const draft = state.drafts.get(key);
    if (!enabled || state.pending || !draft || !Object.hasOwn(group.fields, field)) return false;
    const changes = editDraftChanges(group, draft.baseline, draft.values);
    if (!Object.keys(changes).length) {
      cancel(row);
      return false;
    }
    const server = read(row);
    const conflict =
      !server || fields.some((name) => !Object.is(server[name], draft.baseline[name]));
    const validation = validateEditDraft(group, row, draft.values);
    const drafts = new Map(state.drafts);
    const feedback = {
      ...draft,
      feedback: field,
      phase: conflict ? ('conflict' as const) : draft.phase,
    };
    drafts.set(key, feedback);
    if (
      conflict ||
      draft.phase === 'conflict' ||
      !validation.valid ||
      (!retry && draft.attempted === draft.revision)
    ) {
      publish({ ...state, drafts });
      return false;
    }
    // Validation above is the boundary from intermediate scalar input to the declared DTO.
    const submission: DataTableEditSubmission<T, V> = {
      row,
      changes,
      values: { ...draft.values } as V,
    };
    drafts.set(key, { ...feedback, attempted: draft.revision });
    publish({ ...state, drafts, pending: submission });
    let saved = false;
    try {
      await group.save(submission);
      saved = true;
    } catch {
      /* Preserve safe status only; owners classify transport errors and reconcile storage. */
    }
    const after = current.current;
    if (after.scope === scope && after.pending === submission) {
      const settled = new Map(after.drafts);
      if (saved || group.failure === 'discard') settled.delete(key);
      else settled.set(key, { ...feedback, attempted: draft.revision, phase: 'failed' });
      publish({ ...after, drafts: settled, pending: undefined });
    }
    return saved;
  };

  const column = (
    field: keyof V & string,
    render?: (
      props: ComponentProps<typeof DataTableEditCell>,
      row: T,
      values: Readonly<DataTableEditDraft<V>>,
    ) => ReactNode,
  ): DataTableCellEditing<T> => {
    if (!Object.hasOwn(group.fields, field)) throw new Error('Unknown editable column binding.');
    return {
      render: (row, label, id) => {
        const baseline = read(row);
        if (!baseline) return undefined;
        const draft = rendered.drafts.get(rowKey(row));
        const values = draft?.values ?? baseline;
        const definition = group.fields[field];
        const editor =
          typeof definition.editor === 'function'
            ? definition.editor(values, row)
            : definition.editor;
        const required =
          typeof definition.required === 'function'
            ? !!definition.required(values, row)
            : !!definition.required;
        const validation = validateEditDraft(group, row, values);
        const pending = rendered.pending;
        const busy = !!pending && rowKey(pending.row) === rowKey(row);
        const displayed = group.display?.(row, values, pending) ?? values;
        const feedback =
          draft?.feedback === field
            ? busy
              ? copy.saving
              : draft.phase === 'conflict'
                ? copy.conflict
                : draft.phase === 'failed'
                  ? copy.failed
                  : !validation.valid
                    ? copy.incomplete
                    : undefined
            : undefined;
        const props: ComponentProps<typeof DataTableEditCell> = {
          value: displayed[field],
          label,
          rowId: id,
          editor,
          required,
          busy,
          disabled: !enabled || !!pending || definition.canEdit?.(values, row) === false,
          reason: definition.unavailableReason?.(values, row),
          issue: draft ? validation.issues[field] : undefined,
          feedback,
          copy,
          change: (value) => change(row, field, value),
          complete: () => {
            void complete(row, field);
          },
          cancel: busy ? undefined : () => cancel(row),
          retry:
            draft?.phase === 'failed' && validation.valid
              ? () => {
                  void complete(row, field, true);
                }
              : undefined,
        };
        return render ? render(props, row, values) : <DataTableEditCell {...props} />;
      },
    };
  };
  return {
    column,
    change,
    complete,
    cancel,
    busy: !!rendered.pending,
    pending: rendered.pending,
    dirty: rendered.drafts.size > 0,
  };
}
