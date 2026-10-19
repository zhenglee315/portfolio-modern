import { useEffect, useState } from 'react';
import type { Locale } from './locales';
import { createProfileI18n, profileMessages, updateProfileMessages } from './profile-copy';

/** Keep the provider identity and draft subtree stable while locale or hot-loaded copy changes. */
export function useProfileI18n(locale: Locale, resources = profileMessages) {
  const [instance] = useState(() => createProfileI18n(locale, resources));
  useEffect(() => {
    updateProfileMessages(instance, resources);
    if (instance.language !== locale) void instance.changeLanguage(locale);
  }, [instance, locale, resources]);
  return instance;
}
