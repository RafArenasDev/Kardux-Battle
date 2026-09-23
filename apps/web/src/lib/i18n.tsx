import type { Locale, LocalizedText } from '@kardux/content';
import type { JSX, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'kardux.locale';

function initialLocale(): Locale {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'es' || saved === 'en') return saved;
    } catch {
        // Storage can be blocked (private mode): fall back to the browser language.
    }
    return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

/** Current locale outside React (error mapping, formatters). Kept in sync by the provider. */
let activeLocale: Locale = initialLocale();

export function currentLocale(): Locale {
    return activeLocale;
}

/** Picks the text for the active locale; plain strings pass through untouched. */
export function pick(
    value: LocalizedText | string | undefined | null,
    locale: Locale = activeLocale,
): string {
    if (value === undefined || value === null) return '';
    return typeof value === 'string' ? value : value[locale];
}

interface I18n {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    /** Inline bilingual copy: `t('Jugar', 'Play')`. */
    t: (es: string, en: string) => string;
    /** Localized content (deck names, attributes, avatars). */
    l: (value: LocalizedText | string | undefined | null) => string;
}

const I18nContext = createContext<I18n | null>(null);

const FALLBACK: I18n = {
    get locale() {
        return activeLocale;
    },
    setLocale: (locale) => {
        activeLocale = locale;
    },
    t: (es, en) => (activeLocale === 'es' ? es : en),
    l: (text) => pick(text),
};

export function I18nProvider({ children }: { children: ReactNode }): JSX.Element {
    const [locale, setLocaleState] = useState<Locale>(activeLocale);

    const setLocale = useCallback((next: Locale) => {
        activeLocale = next;
        setLocaleState(next);
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Not persisted: the choice still applies for this visit.
        }
    }, []);

    useEffect(() => {
        document.documentElement.lang = locale;
    }, [locale]);

    const value = useMemo<I18n>(
        () => ({
            locale,
            setLocale,
            t: (es, en) => (locale === 'es' ? es : en),
            l: (text) => pick(text, locale),
        }),
        [locale, setLocale],
    );

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
    // Outside the provider (e.g. mid hot-reload) fall back to the stored locale instead of crashing.
    return useContext(I18nContext) ?? FALLBACK;
}
