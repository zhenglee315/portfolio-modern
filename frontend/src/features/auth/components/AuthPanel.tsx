import { Icon } from '@/shared/ui/Icon';
import { lazy, Suspense } from 'react';
import { useAuthPanelController } from '../hooks/useAuthPanelController';
import { AuthCowScene } from './AuthCowScene';
import { AuthFormBody } from './AuthFormBody';
import { AuthModeSwitch } from './AuthModeSwitch';
import styles from './AuthPanel.module.css';
import type { AuthPanelProps } from './AuthPanel.types';
export type { AuthEmailRequest, AuthRequest, AuthVerifyRequest } from './AuthPanel.types';

const WarningModal = lazy(() => import('@/shared/ui/WarningModal'));

/** Compose the account form, transition preview and cow without retaining credential values. */
export function AuthPanel(props: AuthPanelProps) {
  const controller = useAuthPanelController(props);
  const {
    animationActive,
    controls,
    t,
    mode,
    slide,
    welcome,
    denied,
    fields,
    warning,
    setWarning,
    titleId,
    readFormSnapshot,
    changeMode,
    leave,
  } = controller;

  return (
    <section className={styles.panel} aria-labelledby={titleId} data-auth-panel>
      {warning && (
        <Suspense fallback={null}>
          <WarningModal
            title={t('auth.warningTitle')}
            message={t(warning)}
            closeLabel={t('auth.closeWarning')}
            onClose={() => setWarning(null)}
          />
        </Suspense>
      )}
      <div className={styles.toolbar}>
        <button type="button" className={styles.back} onClick={leave}>
          <Icon name="doorOpenOutline" className={styles.backIcon} pulse="chat" />
          {t('auth.backToPortfolio')}
        </button>
        {controls && <div className={styles.controls}>{controls}</div>}
      </div>

      <div className={styles.card}>
        <div className={styles.reserved}>
          <AuthCowScene
            active={animationActive}
            pointerOrigin={fields}
            welcome={welcome}
            denied={denied}
          />
        </div>
        <div className={styles.content}>
          <AuthModeSwitch
            mode={mode === 'register' ? 'register' : 'login'}
            onChange={changeMode}
            onDragPosition={(position) => slide.drag(position, readFormSnapshot)}
          />

          {<AuthFormBody key={mode} mode={mode} controller={controller} />}
          {slide.previewMode && (
            <AuthFormBody
              key={`preview-${slide.previewMode}`}
              mode={slide.previewMode}
              preview
              controller={controller}
            />
          )}
        </div>
      </div>
    </section>
  );
}
