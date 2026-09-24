import type { Locale } from '@kardux/content';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../lib/i18n';

const LOCALES: { id: Locale; label: string; name: string }[] = [
    { id: 'es', label: 'ES', name: 'Español' },
    { id: 'en', label: 'EN', name: 'English' },
];

/** Compact ES/EN pill; the choice is remembered on this device. */
export function LanguageSwitch({ className = '' }: { className?: string }): JSX.Element {
    const { t } = useTranslation();
    const { locale, setLocale } = useLocale();

    return (
        <div
            className={`lang-switch ${className}`}
            role="radiogroup"
            aria-label={t('common.language')}
        >
            {LOCALES.map((option) => (
                <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={locale === option.id}
                    aria-label={option.name}
                    lang={option.id}
                    className={`lang-switch__option ${locale === option.id ? 'is-active' : ''}`}
                    onClick={() => setLocale(option.id)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}
