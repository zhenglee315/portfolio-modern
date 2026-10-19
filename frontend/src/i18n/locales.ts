import { z } from 'zod';

/** Locale identities and contracts do not require loading translated UI dictionaries. */
export const supportedLocales = ['en', 'zh-Hans', 'zh-Hant'] as const;
export const defaultLocale = 'en';
export const localeSchema = z.enum(supportedLocales);
export type Locale = z.infer<typeof localeSchema>;
