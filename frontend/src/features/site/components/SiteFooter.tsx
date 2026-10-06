import { useTranslation } from 'react-i18next';
import type { Site } from '../schemas/site';
import { emailUrl, fullName } from '../model/profile';
import { Icon } from '@/shared/ui/Icon';
import styles from './Site.module.css';

/** Present maintained copyright and a safe email link with injected final destination. */
export function SiteFooter({
  site,
  location,
}: {
  site?: Site;
  location?: { city: string; country: string };
}) {
  const { t } = useTranslation();
  const email = site && emailUrl(site.social.email);
  return (
    <footer className={styles.footer}>
      {site && (
        <>
          <div>
            <span className={styles.wordmark}>
              {site.brand.title}
              <b>.</b>
              <small>{site.brand.titleSub}</small>
            </span>
            <p>{site.profile.footerContent}</p>
          </div>
          {email && (
            <a className="text-link" href={email}>
              {t('ui.connect')}
              <Icon name="arrow" />
            </a>
          )}
          <small>
            {location
              ? t('ui.footerCopyright', {
                  year: site.brand.copyrightYear,
                  name: fullName(site.profile),
                  ...location,
                })
              : `© ${site.brand.copyrightYear} ${fullName(site.profile)}`}
          </small>
        </>
      )}
    </footer>
  );
}
