import type { Site } from '../schemas/site';
import styles from './Site.module.css';

/** Share the API wordmark across sidebar and mobile header with a safe empty fallback. */
export function Brand({ site, onHome, label }: { site?: Site; onHome: () => void; label: string }) {
  return (
    <button type="button" className={styles.brand} aria-label={label} onClick={onHome}>
      <span className={styles.wordmark}>
        {site?.brand.title || '—'}
        <b>.</b>
        <small>{site?.brand.titleSub}</small>
      </span>
    </button>
  );
}
