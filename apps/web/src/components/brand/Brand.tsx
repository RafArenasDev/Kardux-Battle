import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import crestUrl from '../../assets/brand/crest.webp';
import logoUrl from '../../assets/brand/logo.webp';
import wordmarkUrl from '../../assets/brand/wordmark.webp';

/** Full crest + title, the hero mark. Source is 437x457 - capped so it never upscales blurry. */
export function BrandLogo({ className }: { className?: string }): JSX.Element {
    return (
        <img
            src={logoUrl}
            alt="Kardux Battle"
            width={437}
            height={457}
            className={['brand-logo', className].filter(Boolean).join(' ')}
            draggable={false}
        />
    );
}

/** Compact crest + wordmark lockup for headers. */
export function BrandLockup({ to = '/' }: { to?: string }): JSX.Element {
    const { t } = useTranslation();
    return (
        <Link to={to} className="brand-lockup" aria-label={t('common.homeLink')}>
            <img src={crestUrl} alt="" width={256} height={265} className="brand-lockup__crest" />
            <img
                src={wordmarkUrl}
                alt="Kardux Battle"
                width={450}
                height={125}
                className="brand-lockup__wordmark"
            />
        </Link>
    );
}

export { crestUrl };
