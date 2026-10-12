import { Fragment, useCallback, useId, useRef, useState } from 'react';
import Dropdown from 'react-bootstrap/Dropdown';
import { useTranslation } from 'react-i18next';
import type { AuthUser } from '@/features/auth/session';
import { useDisclosureFocus } from '@/shared/hooks/useDisclosureFocus';
import { Icon } from '@/shared/ui/Icon';
import { accountMenuGroups } from '../model/menu';
import styles from './AccountMenu.module.css';

/** Present one right-aligned settings disclosure for guests and authenticated accounts.
 * @param props Page-owned account, authentication actions and optional disclosure callback.
 * @returns A circular gear trigger and permission-filtered, accessible menu framework.
 * Bootstrap owns selection, arrow navigation, Escape and outside-pointer dismissal;
 * the shared disclosure lifecycle owns initial focus and outside-focus dismissal.
 * Authentication and management navigation delegate to the page; other rows retain their settings framework.
 */
export function AccountMenu({
  account,
  onOpen,
  busy = false,
  onLogin,
  onLogout,
  onNavigate,
}: {
  account: AuthUser | null;
  onOpen?: () => void;
  busy?: boolean;
  onLogin?: () => void;
  onLogout?: () => void;
  onNavigate?: (resource: 'sites' | 'users' | 'roles') => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    first = useRef<HTMLButtonElement>(null);
  const closeOnBlur = useCallback(() => setOpen(false), []);
  useDisclosureFocus(open, root, first, closeOnBlur);
  const groups = accountMenuGroups(account);
  return (
    <Dropdown
      ref={root}
      className={styles.dropdown}
      show={open}
      focusFirstItemOnShow={false}
      onToggle={(value, metadata) => {
        if (value) onOpen?.();
        setOpen(value);
        if (!value && (metadata.source === 'keydown' || metadata.source === 'select'))
          trigger.current?.focus();
      }}
    >
      <Dropdown.Toggle
        ref={trigger}
        id={id}
        className={`icon-button ${styles.trigger}`}
        variant="link"
        aria-label={t('accountMenu.trigger')}
        data-account-menu-trigger
        aria-haspopup="menu"
        aria-controls={`${id}-panel`}
      >
        <Icon name="gear" />
      </Dropdown.Toggle>
      <Dropdown.Menu
        id={`${id}-panel`}
        role="menu"
        data-account-menu
        align="end"
        className={styles.menu}
        popperConfig={{ modifiers: [{ name: 'offset', options: { offset: [0, 10] } }] }}
      >
        {account && (
          <div className={styles.identity} role="presentation">
            <Icon name="personCircle" className={styles.identityIcon} />
            <div className={styles.identityCopy}>
              <strong>{account.user}</strong>
              <span>{account.role}</span>
            </div>
          </div>
        )}
        {groups.map((group, groupIndex) => (
          <Fragment key={group[0]!.key}>
            {(account || groupIndex > 0) && (
              <Dropdown.Divider className={styles.divider} role="separator" />
            )}
            {group.map((item, itemIndex) => (
              <Dropdown.Item
                as="button"
                type="button"
                role="menuitem"
                key={item.key}
                ref={groupIndex === 0 && itemIndex === 0 ? first : undefined}
                data-account-menu-item={item.key}
                data-auth-action={
                  item.key === 'signIn'
                    ? 'sign-in'
                    : item.key === 'signOut'
                      ? 'sign-out'
                      : undefined
                }
                disabled={busy && (item.key === 'signIn' || item.key === 'signOut')}
                aria-busy={
                  busy && (item.key === 'signIn' || item.key === 'signOut') ? true : undefined
                }
                onClick={() => {
                  if (busy) return;
                  if (item.key === 'signIn') onLogin?.();
                  if (item.key === 'signOut') onLogout?.();
                  if (item.key === 'platformManagement') onNavigate?.('sites');
                  if (item.key === 'userManagement') onNavigate?.('users');
                  if (item.key === 'roleManagement') onNavigate?.('roles');
                }}
              >
                <Icon name={item.icon} pulse={item.heartbeat ? 'chat' : undefined} />
                <span>{t(`accountMenu.${item.key}`)}</span>
              </Dropdown.Item>
            ))}
          </Fragment>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}
