import { createI18n, supportedLocales, type Locale } from './config';
import en from './profile/en.json';
import zhHans from './profile/zh-Hans.json';
import zhHant from './profile/zh-Hant.json';

export const profileMessages = { en, 'zh-Hans': zhHans, 'zh-Hant': zhHant };

/** The lazy Profile route owns its vocabulary; public visits retain the original dictionaries. */
export function createProfileI18n(locale: Locale) {
  const instance = createI18n(locale);
  for (const language of supportedLocales)
    instance.addResourceBundle(
      language,
      'translation',
      {
        profileEditor: profileMessages[language],
      },
      false,
      true,
    );
  return instance;
}
