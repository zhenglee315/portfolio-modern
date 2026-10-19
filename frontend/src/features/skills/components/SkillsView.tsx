import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import styles from './Skills.module.css';

/** Retain one public heading, responsive category grid and continuation placement across sources. */
export function SkillsView({
  children,
  status,
  footer,
}: {
  children?: ReactNode;
  status?: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      <SectionHeader eyebrow={t('ui.skillsEyebrow')} title={t('ui.skillsTitle')} />
      {status}
      <div className={styles.toolkit} data-skill-categories>
        {children}
      </div>
      {footer}
    </>
  );
}
