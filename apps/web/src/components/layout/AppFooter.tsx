import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_VERSION } from '../../lib/config';

/** Version, the free-to-play notice and the one data source the game uses. Identical on every
 *  screen; `compact` only tightens the spacing. */
export function AppFooter({ compact = false }: { compact?: boolean }): JSX.Element {
    const { t } = useTranslation();

    return (
        <footer className={`app-footer ${compact ? 'app-footer--compact' : ''}`}>
            <div className="app-footer__row">
                <span className="badge badge--muted">v{APP_VERSION}</span>
                <span>© {new Date().getFullYear()} Kardux Battle · RafArenasDev</span>
            </div>
            <p className="app-footer__credits">{t('footer.notice')}</p>
            <p className="app-footer__sources">
                {t('footer.source')}{' '}
                <a href="https://pokeapi.co" target="_blank" rel="noopener noreferrer">
                    PokéAPI
                </a>
            </p>
        </footer>
    );
}
