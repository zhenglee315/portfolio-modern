import type { Route } from './+types/home';
import { defaultLocale, localeSchema, messages } from '@/i18n/config';
import { PortfolioPage } from '@/pages/portfolio/PortfolioPage';

/** Build public page metadata from the same locale dictionaries as the UI. */
export function meta({ params }: Route.MetaArgs) {
  const parsed = localeSchema.safeParse(params.locale ?? defaultLocale);
  const copy = messages[parsed.success ? parsed.data : defaultLocale];
  return [
    { title: copy.profile.title },
    { name: 'description', content: copy.profile.description },
  ];
}

/** Compose the profile page at the public route boundary. */
export default function PortfolioRoute() {
  return <PortfolioPage />;
}
