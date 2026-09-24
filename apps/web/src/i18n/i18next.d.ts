import 'i18next';
import type es from './locales/es.json';

/** Typed keys: `t('home.quick.title')` is checked against the Spanish catalog at compile time,
 *  and `scripts/check-i18n.mjs` keeps the English catalog in sync with it. */
declare module 'i18next' {
    interface CustomTypeOptions {
        defaultNS: 'translation';
        resources: { translation: typeof es };
        returnNull: false;
    }
}
