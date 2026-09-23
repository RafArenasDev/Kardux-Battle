import type { JSX } from 'react';
import { APP_VERSION } from '../../lib/config';
import { useI18n } from '../../lib/i18n';

const SOURCES = [
    { name: 'PokéAPI', href: 'https://pokeapi.co' },
    { name: 'Deck of Cards API', href: 'https://deckofcardsapi.com' },
    { name: 'World Bank', href: 'https://data.worldbank.org' },
    { name: 'mledoze/countries', href: 'https://github.com/mledoze/countries' },
    { name: 'flagcdn', href: 'https://flagcdn.com' },
    { name: 'game-icons.net (CC BY 3.0)', href: 'https://game-icons.net' },
];

/** Version, the free-to-play notice and the attributions every data/art source requires.
 *  The same notice shows everywhere; the compact variant only drops the source links. */
export function AppFooter({ compact = false }: { compact?: boolean }): JSX.Element {
    const { t } = useI18n();

    return (
        <footer className={`app-footer ${compact ? 'app-footer--compact' : ''}`}>
            <div className="app-footer__row">
                <span className="badge badge--muted">v{APP_VERSION}</span>
                <span>© {new Date().getFullYear()} Kardux Battle · RafArenasDev</span>
            </div>
            <p className="app-footer__credits">
                {t(
                    'Juego gratuito sin fines de lucro: no hay pagos, compras ni dinero real; las fichas del casino son virtuales. Proyecto de fans no afiliado a Nintendo, Game Freak ni The Pokémon Company; las marcas pertenecen a sus dueños.',
                    'Free, non-profit game: no payments, purchases or real money; casino chips are virtual. Fan project not affiliated with Nintendo, Game Freak or The Pokémon Company; trademarks belong to their owners.',
                )}
            </p>
            {compact ? null : (
                <p className="app-footer__sources">
                    {t('Datos e imágenes: ', 'Data and images: ')}
                    {SOURCES.map((source, index) => (
                        <span key={source.name}>
                            {index > 0 ? ' · ' : null}
                            <a href={source.href} target="_blank" rel="noopener noreferrer">
                                {source.name}
                            </a>
                        </span>
                    ))}
                </p>
            )}
        </footer>
    );
}
