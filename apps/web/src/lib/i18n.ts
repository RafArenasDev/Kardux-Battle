import type { Locale, LocalizedText } from '@kardux/content';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

/** Active UI language, usable outside React (error mapping, formatters). */
export function currentLocale(): Locale {
    return i18n.resolvedLanguage === 'es' ? 'es' : 'en';
}

/** Picks the right side of bilingual game content (deck names, attributes, avatars) that
 *  ships inside `@kardux/content` rather than in the UI catalogs. */
export function pick(
    value: LocalizedText | string | undefined | null,
    locale: Locale = currentLocale(),
): string {
    if (value === undefined || value === null) return '';
    return typeof value === 'string' ? value : value[locale];
}

interface LocaleApi {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    /** Localized game content, re-rendered when the language changes. */
    l: (value: LocalizedText | string | undefined | null) => string;
}

export function useLocale(): LocaleApi {
    const { i18n: instance } = useTranslation();
    const locale: Locale = instance.resolvedLanguage === 'es' ? 'es' : 'en';
    const setLocale = useCallback((next: Locale) => void instance.changeLanguage(next), [instance]);
    const l = useCallback(
        (value: LocalizedText | string | undefined | null) => pick(value, locale),
        [locale],
    );
    return { locale, setLocale, l };
}
