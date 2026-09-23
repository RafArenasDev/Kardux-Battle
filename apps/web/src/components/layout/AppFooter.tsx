import type { JSX } from 'react';
import { APP_VERSION } from '../../lib/config';

/** Version + the attributions every data/art source requires. */
export function AppFooter({ compact = false }: { compact?: boolean }): JSX.Element {
    return (
        <footer className={`app-footer ${compact ? 'app-footer--compact' : ''}`}>
            <div className="app-footer__row">
                <span className="badge badge--muted">v{APP_VERSION}</span>
                <span>© {new Date().getFullYear()} Kardux Battle · RafArenasDev</span>
            </div>
            {compact ? null : (
                <p className="app-footer__credits">
                    Datos de{' '}
                    <a href="https://pokeapi.co" target="_blank" rel="noopener noreferrer">
                        PokéAPI
                    </a>{' '}
                    y{' '}
                    <a href="https://deckofcardsapi.com" target="_blank" rel="noopener noreferrer">
                        Deck of Cards API
                    </a>
                    . Pokémon © Nintendo, Game Freak y The Pokémon Company - proyecto sin fines de
                    lucro. Íconos de{' '}
                    <a href="https://game-icons.net" target="_blank" rel="noopener noreferrer">
                        game-icons.net
                    </a>{' '}
                    (CC BY 3.0).
                </p>
            )}
        </footer>
    );
}
