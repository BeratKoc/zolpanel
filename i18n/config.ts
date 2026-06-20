// Client-güvenli i18n sabitleri (next/headers gibi server-only modül İÇERMEZ).
export const locales = ['tr', 'en', 'zh', 'es', 'de', 'fr'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'tr';

export const localeNames: Record<Locale, string> = {
  tr: 'Türkçe',
  en: 'English',
  zh: '中文',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
};
