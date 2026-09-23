import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import { currentLocale } from '../lib/i18n';

interface ErrorBoundaryState {
    error: Error | null;
}

/** Last line of defense: never leave the player on a blank screen. The player gets a plain
 *  message and a way out; the technical detail only goes to the console. */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
    override state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    override componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('Kardux UI crashed:', error, info.componentStack);
    }

    override render(): ReactNode {
        const { error } = this.state;
        if (!error) return this.props.children;

        const es = currentLocale() === 'es';
        const inMatch =
            window.location.pathname.startsWith('/match') ||
            window.location.pathname.startsWith('/casino');

        return (
            <div className="page-loading">
                <div
                    className="panel panel--pad stack"
                    style={{ maxWidth: 460, textAlign: 'center' }}
                >
                    <h2>
                        {es ? 'No pudimos mostrar esta pantalla' : 'We could not show this screen'}
                    </h2>
                    <p className="text-2">
                        {es
                            ? 'Recarga para intentarlo de nuevo o vuelve al inicio.'
                            : 'Reload to try again or go back home.'}
                        {inMatch &&
                            (es
                                ? ' Tu partida sigue guardada: al recargar vuelves a tu mesa.'
                                : ' Your match is still saved: reloading brings you back to your table.')}
                    </p>
                    <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
                        <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => window.location.assign('/')}
                        >
                            {es ? 'Ir al inicio' : 'Go home'}
                        </button>
                        <button
                            type="button"
                            className="btn btn--gold"
                            onClick={() => window.location.reload()}
                        >
                            {es ? 'Recargar' : 'Reload'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
