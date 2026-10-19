import { createI18n, supportedLocales, type Locale } from './config';
import type { i18n } from 'i18next';
import en from './profile/en.json';
import zhHans from './profile/zh-Hans.json';
import zhHant from './profile/zh-Hant.json';

export const profileMessages = { en, 'zh-Hans': zhHans, 'zh-Hant': zhHant };

/** Replace route copy in place so mounted translators can react to newly added keys. */
export function updateProfileMessages(instance: i18n, resources = profileMessages) {
  for (const language of supportedLocales)
    instance.addResourceBundle(
      language,
      'translation',
      {
        profileEditor: resources[language],
      },
      false,
      true,
    );
}

/** The lazy Profile route owns its vocabulary; public visits retain the original dictionaries. */
export function createProfileI18n(locale: Locale, resources = profileMessages) {
  const instance = createI18n(locale);
  instance.options.react = { ...instance.options.react, bindI18nStore: 'added removed' };
  updateProfileMessages(instance, resources);
  return instance;
}
