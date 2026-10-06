import Container from 'react-bootstrap/Container';
import { useTranslation } from 'react-i18next';
import profileIcon from 'bootstrap-icons/icons/person-circle.svg';

/** Provide the initial page composition boundary for future profile features. */
export function PortfolioPage() {
  const { t } = useTranslation();

  return (
    <Container as="main" className="py-5">
      <div className="d-flex align-items-center gap-3 mb-3">
        <img src={profileIcon} alt="" aria-hidden="true" width={32} height={32} />
        <h1 className="mb-0">{t('profile.title')}</h1>
      </div>
      <p className="text-body-secondary">{t('profile.description')}</p>
    </Container>
  );
}
