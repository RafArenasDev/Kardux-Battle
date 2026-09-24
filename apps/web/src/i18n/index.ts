import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';

export const SUPPORTED_LOCALES = ['es', 'en'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

/** `localStorage` key that remembers the player's language on this device. */
const STORAGE_KEY = 'kardux.locale';

export const resources = {
    es: { translation: es },
    en: { translation: en },
} as const;

/**
 * Every piece of UI copy lives in `locales/<lang>.json` and is looked up by key - components
 * never embed Spanish or English text. Detection order: the saved choice, then the browser
 * language; anything that is not Spanish falls back to English.
 */
void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        supportedLngs: SUPPORTED_LOCALES,
        nonExplicitSupportedLngs: true,
        load: 'languageOnly',
        fallbackLng: 'en',
        interpolation: { escapeValue: false },
        returnNull: false,
        detection: {
            order: ['localStorage', 'navigator'],
            lookupLocalStorage: STORAGE_KEY,
            caches: ['localStorage'],
        },
    });

i18n.on('languageChanged', (language) => {
    document.documentElement.lang = language;
});
document.documentElement.lang = i18n.resolvedLanguage ?? 'en';

export default i18n;
