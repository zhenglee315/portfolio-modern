/** Fit an ordered prefix and its disclosure within 75% of the available row.
 * @param widths Measured tag widths in source order.
 * @param total Full owner count, including unloaded tags.
 * @param available Container width; collapsed preview reserves room for disclosure.
 * @param toggleWidth Width of the localized disclosure for a hidden count.
 */
export function tagPreviewCount(
  widths: number[],
  total: number,
  available: number,
  gap: number,
  toggleWidth: (hidden: number) => number,
) {
  const all = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;
  if (total === widths.length && all <= available * 0.75) return widths.length;
  let count = 0,
    used = 0;
  for (let i = 0; i <= widths.length; i++) {
    const hidden = total - i;
    const needed = used + (i && hidden ? gap : 0) + (hidden ? toggleWidth(hidden) : 0);
    if (needed <= available * 0.75) count = i;
    if (i < widths.length) used += (widths[i] ?? 0) + (i ? gap : 0);
  }
  return count;
}
/** Derive stable ordinal tags from complete label arrays; no owner API is involved. */
export function labelTags(labels: string[] | null) {
  return (labels ?? []).map((label, id) => ({ id, label }));
}
