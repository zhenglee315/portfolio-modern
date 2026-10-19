import { Icon, IconGroup } from '@/shared/ui/Icon';
import styles from '../ProfilePage.module.css';

/** One add target for editor lists; reuse the homepage heartbeat and shared motion policy. */
export function AddContentTile({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={styles.addTile}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {/* The decorative frame shares the icon heartbeat; the button's hit area stays still. */}
      <IconGroup pulse={disabled ? undefined : 'disclosure'}>{null}</IconGroup>
      <Icon name="plus" pulse={disabled ? undefined : 'disclosure'} />
    </button>
  );
}
