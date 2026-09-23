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
                    Proyecto de fans sin fines de lucro. No está afiliado, patrocinado ni respaldado
                    por Nintendo, Game Freak ni The Pokémon Company; Pokémon y sus nombres son
                    marcas de sus respectivos dueños. Datos vía{' '}
                    <a href="https://pokeapi.co" target="_blank" rel="noopener noreferrer">
                        PokéAPI
                    </a>
                    . Íconos de{' '}
                    <a href="https://game-icons.net" target="_blank" rel="noopener noreferrer">
                        game-icons.net
                    </a>{' '}
                    (CC BY 3.0).
                </p>
            )}
        </footer>
    );
}
