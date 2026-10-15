export type TableChoiceColor = 'pink' | 'cyan' | 'violet' | 'green' | 'orange' | 'red' | 'blue';

const colors: TableChoiceColor[] = ['pink', 'cyan', 'violet', 'green', 'orange', 'red', 'blue'];

/** Keep pastel colors stable across selection changes, locales and server/client rendering.
 * @author ZhengLee 2026.10.15
 */
export function tableChoiceColor(value: string, override?: TableChoiceColor): TableChoiceColor {
  let hash = 0;
  for (const character of value.toLowerCase()) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  return override ?? colors[hash % colors.length]!;
}
