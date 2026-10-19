import type { Locale } from '@/i18n/config';

/** Language names remain in their own script across interface and content-language controls. */
export const languageNames: Record<Locale, string> = {
  en: 'English',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
};
