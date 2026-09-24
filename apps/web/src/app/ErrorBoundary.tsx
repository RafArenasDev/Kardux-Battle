import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import i18n from '../i18n';

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

        const { t } = i18n;
        return (
            <div className="page-loading">
                <div
                    className="panel panel--pad stack"
                    style={{ maxWidth: 460, textAlign: 'center' }}
                >
                    <h2>{t('crash.title')}</h2>
                    <p className="text-2">{t('crash.body')}</p>
                    <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
                        <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => window.location.assign('/')}
                        >
                            {t('crash.home')}
                        </button>
                        <button
                            type="button"
                            className="btn btn--gold"
                            onClick={() => window.location.reload()}
                        >
                            {t('crash.reload')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
