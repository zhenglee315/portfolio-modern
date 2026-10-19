import { moveProfileItem } from '@/features/profile-content';

export type ReorderPlacement = 'before' | 'after';
export type ReorderTarget = { id: string; placement: ReorderPlacement };
export type ReorderRect = { id: string; left: number; top: number; width: number; height: number };
export type ReorderFlow = {
  left: number;
  top: number;
  width: number;
  columnGap: number;
  rowGap: number;
};

/** Project an insertion into stable grid slots without mutating IDs or moving the captured DOM node. */
export function reorderLayout(
  items: readonly ReorderRect[],
  source: string,
  target: ReorderTarget | null,
  columns: number,
  gap: number,
) {
  const ids = items.map((item) => item.id);
  const order = target ? moveProfileItem(ids, source, target.id, target.placement) : ids;
  const byId = new Map(items.map((item) => [item.id, item]));
  const positions: Record<string, { x: number; y: number }> = {};
  let top = items[0]?.top ?? 0;
  const count = Math.max(1, columns);
  for (let row = 0; row < order.length; row += count) {
    const entries = order.slice(row, row + count).map((id) => byId.get(id)!);
    entries.forEach((item, column) => {
      positions[item.id] = { x: items[column]!.left - item.left, y: top - item.top };
    });
    top += Math.max(...entries.map((item) => item.height)) + gap;
  }
  return positions;
}

/** Match wrapping flex rows using each chip's measured width, including centered variable heights. */
export function reorderFlowLayout(
  items: readonly ReorderRect[],
  source: string,
  target: ReorderTarget | null,
  flow: ReorderFlow,
) {
  const ids = items.map((item) => item.id);
  const order = target ? moveProfileItem(ids, source, target.id, target.placement) : ids;
  // Preserve the browser's exact subpixel positions when no insertion is requested.
  if (order === ids) return Object.fromEntries(ids.map((id) => [id, { x: 0, y: 0 }]));
  const byId = new Map(items.map((item) => [item.id, item]));
  const rows: ReorderRect[][] = [[]];
  let width = 0;
  for (const id of order) {
    const item = byId.get(id)!;
    let row = rows.at(-1)!;
    const nextWidth = width + (row.length ? flow.columnGap : 0) + item.width;
    if (row.length && nextWidth > flow.width + 0.5) {
      row = [];
      rows.push(row);
      width = 0;
    }
    width += (row.length ? flow.columnGap : 0) + item.width;
    row.push(item);
  }
  const positions: Record<string, { x: number; y: number }> = {};
  let top = flow.top;
  for (const row of rows) {
    const height = Math.max(0, ...row.map((item) => item.height));
    let left = flow.left;
    for (const item of row) {
      positions[item.id] = { x: left - item.left, y: top + (height - item.height) / 2 - item.top };
      left += item.width + flow.columnGap;
    }
    top += height + flow.rowGap;
  }
  return positions;
}
