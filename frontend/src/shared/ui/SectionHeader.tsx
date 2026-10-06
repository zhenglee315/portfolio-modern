import styles from './SectionHeader.module.css';

/** Share heading geometry while leaving section copy and optional note to its owner. */
export function SectionHeader({
  eyebrow,
  title,
  note,
}: {
  eyebrow: string;
  title: string;
  note?: string;
}) {
  return (
    <header className={styles.header}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>
          {title}
          <span>.</span>
        </h2>
      </div>
      {note && <p className={styles.note}>{note}</p>}
    </header>
  );
}
