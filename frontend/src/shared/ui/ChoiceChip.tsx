import { tableChoiceColor, type TableChoiceColor } from '../lib/table-choice-color';
import styles from './ChoiceChip.module.css';

/** Stable label colors shared by filters and assignment editors. @author ZhengLee 2026.10.16 */
export function ChoiceChip({ label, color }: { label: string; color?: TableChoiceColor }) {
  return (
    <span className={styles.chip} data-color={tableChoiceColor(label, color)} title={label}>
      {label}
    </span>
  );
}
