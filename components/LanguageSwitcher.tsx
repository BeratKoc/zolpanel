'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { locales, localeNames, type Locale } from '@/i18n/config';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations();

  function change(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    document.cookie = `locale=${value};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  }

  return (
    <select
      value={locale}
      onChange={change}
      aria-label={t('common.language')}
      style={{
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        color: 'var(--text-muted)',
        fontSize: '12px',
        padding: '5px 8px',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {locales.map((l) => (
        <option key={l} value={l}>
          {localeNames[l as Locale]}
        </option>
      ))}
    </select>
  );
}
