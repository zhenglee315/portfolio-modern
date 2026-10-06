import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { QueryStatus } from '@/shared/ui/QueryStatus';
import { queryCopy } from '@/i18n/query-copy';
import type { Locale } from '@/i18n/config';
import { useSite } from '../api/site';
import { emailUrl, fullName, safeSocialUrl } from '../model/profile';
import styles from './Site.module.css';

type Props = {
  locale: Locale;
  tenure?: string;
  controls?: ReactNode;
  controlsRef?: Ref<HTMLDivElement>;
  onExplore: () => void;
};

/** Render API-owned identity, introduction, contacts and injected journey summary.
 * @param props URL locale, optional work tenure and page-coordinated control slot.
 * Independent query failures leave navigation and sibling sections available.
 */
export function ProfileOverview({ locale, tenure, controls, controlsRef, onExplore }: Props) {
  const { t } = useTranslation();
  const query = useSite(locale);
  const site = query.data;
  const links: { name: IconName; href: string | undefined; label: string }[] = site
    ? [
        ...(['linkedin', 'github', 'medium'] as const).map((name) => ({
          name,
          href: safeSocialUrl(site.social[name]),
          label: t(`ui.${name}`),
        })),
        {
          name: 'envelope',
          href: emailUrl(site.social.email),
          label: t('ui.email', { email: site.social.email }),
        },
      ]
    : [];
  return (
    <div className={styles.intro}>
      <div
        ref={controlsRef}
        className={styles.socials}
        data-profile-controls
        aria-label={t('ui.contacts')}
      >
        {links
          .filter((link) => link.href)
          .map((link) => (
            <a
              key={link.name}
              className="icon-button"
              href={link.href}
              aria-label={link.label}
              target={link.name === 'envelope' ? undefined : '_blank'}
              rel="noopener noreferrer"
            >
              <Icon name={link.name} />
            </a>
          ))}
        {controls}
      </div>
      <QueryStatus
        pending={query.isPending}
        failed={query.isError}
        hasData={!!site}
        fetching={query.isFetching}
        copy={queryCopy(t, query.error, !!site, true)}
        onRetry={() => void query.refetch()}
      />
      {site && (
        <>
          <p className="eyebrow">
            <span className={styles.tinyLine} aria-hidden="true" />
            {site.profile.introContent}
          </p>
          <h1 data-profile-content>
            <span className={styles.greeting}>{t('ui.hello')}</span>
            <span>
              {fullName(site.profile)}
              {t('ui.namePunctuation')}
            </span>
          </h1>
          <p className={`${styles.copy} plain-text`}>{site.profile.content}</p>
          <button type="button" className={`text-link ${styles.explore}`} onClick={onExplore}>
            {t('ui.exploreWork')}
            <Icon name="arrow" />
          </button>
          <div className={styles.meta}>
            <span title={t('ui.tenureHint')}>{tenure ?? t('ui.empty')}</span>
            <i aria-hidden="true" />
            <span>
              {site.profile.eduCode} · {site.profile.program}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
