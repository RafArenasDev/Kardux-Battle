import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

interface ErrorBoundaryState {
    failed: boolean;
}

/** Last line of defense: never leave the player on a blank screen. The match itself lives on
 *  the server, so reloading always drops them back into their seat. */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
    override state: ErrorBoundaryState = { failed: false };

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { failed: true };
    }

    override componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('Kardux UI crashed:', error, info.componentStack);
    }

    override render(): ReactNode {
        if (!this.state.failed) return this.props.children;

        return (
            <div className="page-loading">
                <div
                    className="panel panel--pad stack"
                    style={{ maxWidth: 420, textAlign: 'center' }}
                >
                    <h2>Algo salió mal</h2>
                    <p className="text-2">
                        Tu partida sigue guardada en el servidor. Recarga para volver a tu mesa.
                    </p>
                    <button
                        type="button"
                        className="btn btn--gold"
                        onClick={() => window.location.reload()}
                    >
                        Recargar
                    </button>
                </div>
            </div>
        );
    }
}
