import styles from './Breadcrumb.module.css';
import { Icon, type IconName } from './Icon';

type BreadcrumbItem = {
  label: string;
  href?: string;
  icon?: IconName;
};

/** Share accessible path presentation while its owner supplies labels and destinations.
 * @param props Localized navigation label and ordered ancestors ending with the current page.
 * @returns Wrapping links, decorative separators and one noninteractive current-page item.
 * Native links retain URL fragments and work before hydration; no data reads happen here.
 */
export function Breadcrumb({ label, items }: { label: string; items: readonly BreadcrumbItem[] }) {
  return (
    <nav aria-label={label}>
      <ol className={styles.list}>
        {items.map((item, index) => {
          const current = index === items.length - 1;
          const content = (
            <>
              {item.icon && <Icon name={item.icon} />}
              {item.label}
            </>
          );
          return (
            <li key={`${index}:${item.label}`} className={styles.item}>
              {index > 0 && (
                <span className={styles.separator} aria-hidden="true">
                  /
                </span>
              )}
              {!current && item.href ? (
                <a className={styles.link} href={item.href}>
                  {content}
                </a>
              ) : (
                <span className={styles.copy} aria-current={current ? 'page' : undefined}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
