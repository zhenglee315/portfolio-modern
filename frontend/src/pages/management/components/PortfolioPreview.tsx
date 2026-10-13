import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import Modal from 'react-bootstrap/Modal';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { cycleDialogTab } from '@/shared/lib/focus';
import { Icon } from '@/shared/ui/Icon';
import { LoadingIndicator } from '@/shared/ui/LoadingIndicator';
import styles from './PortfolioPreview.module.css';

/** Embed the existing portfolio document so its viewport, background and child dialogs stay contained. */
export default function PortfolioPreview({
  locale,
  siteId,
  user,
  onClose,
}: {
  locale: Locale;
  siteId: number;
  user: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const frame = useRef<HTMLIFrameElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const message = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow)
        return;
      if (event.data?.type === 'portfolio-preview-close') onClose();
      if (event.data?.type === 'portfolio-preview-focus-close') close.current?.focus();
    };
    window.addEventListener('message', message);
    return () => window.removeEventListener('message', message);
  }, [onClose]);
  return (
    <Modal
      show
      centered
      onHide={onClose}
      className={styles.dialog}
      dialogClassName={styles.viewport}
      contentClassName={styles.content}
      aria-labelledby={id}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => cycleDialogTab(event, event.currentTarget)}
    >
      <Modal.Header>
        <Modal.Title id={id}>
          <Icon name="eye" />
          {t('management.previewTitle')}
          <span className={styles.user}>{user}</span>
        </Modal.Title>
        <button
          ref={close}
          type="button"
          className="btn-close"
          aria-label={t('management.close')}
          onClick={onClose}
        />
      </Modal.Header>
      <Modal.Body className={styles.body}>
        {loading && (
          <div className={styles.loading}>
            <LoadingIndicator label={t('ui.loading')} />
          </div>
        )}
        <iframe
          ref={frame}
          src={`/${locale}/management/preview/${siteId}`}
          title={t('management.previewRow', { name: user })}
          onLoad={() => setLoading(false)}
          referrerPolicy="same-origin"
        />
      </Modal.Body>
    </Modal>
  );
}
