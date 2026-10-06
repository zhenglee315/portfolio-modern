import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { z } from 'zod';
import en from './messages/en.json';
import zhHans from './messages/zh-Hans.json';
import zhHant from './messages/zh-Hant.json';

export const supportedLocales = ['en', 'zh-Hans', 'zh-Hant'] as const;
export const defaultLocale = 'en';
export const localeSchema = z.enum(supportedLocales);
export type Locale = z.infer<typeof localeSchema>;
export const messages = { en, 'zh-Hans': zhHans, 'zh-Hant': zhHant };

/** Create synchronous, isolated translations for browser and build-time rendering. */
export function createI18n(locale: Locale) {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      'zh-Hans': { translation: zhHans },
      'zh-Hant': { translation: zhHant },
    },
    lng: locale,
    fallbackLng: defaultLocale,
    supportedLngs: [...supportedLocales],
    load: 'currentOnly',
    initAsync: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}
