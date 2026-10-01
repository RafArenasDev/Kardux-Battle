import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_VERSION } from '../../lib/config';

/** The year this project actually started - a fixed fact, never derived from "now". */
const LAUNCH_YEAR = 2026;

/** "2026" while it's still the launch year, "2026-2027" once a later year rolls around - so the
 *  footer itself tells you both when this was built and how long it's been kept up. */
function copyrightYears(): string {
    const currentYear = new Date().getFullYear();
    return currentYear > LAUNCH_YEAR ? `${LAUNCH_YEAR}-${currentYear}` : `${LAUNCH_YEAR}`;
}

/** Version, the free-to-play notice and the one data source the game uses. Identical on every
 *  screen; `compact` only tightens the spacing. */
export function AppFooter({ compact = false }: { compact?: boolean }): JSX.Element {
    const { t } = useTranslation();

    return (
        <footer className={`app-footer ${compact ? 'app-footer--compact' : ''}`}>
            <div className="app-footer__row">
                <span className="badge badge--muted">v{APP_VERSION}</span>
                <span>© {copyrightYears()} Kardux Battle · RafArenasDev</span>
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
