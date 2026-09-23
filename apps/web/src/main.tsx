import '@fontsource/lilita-one/400.css';
import '@fontsource-variable/nunito';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/layout.css';
import './styles/cards.css';
import './styles/game.css';

import { MotionConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found.');

// Installable PWA: offline app shell, silently updated in the background.
if (import.meta.env.PROD) {
    registerSW({ immediate: true });
}

createRoot(container).render(
    <StrictMode>
        <MotionConfig reducedMotion="never">
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <ErrorBoundary>
                    <ToastProvider>
                        <App />
                    </ToastProvider>
                </ErrorBoundary>
            </BrowserRouter>
        </MotionConfig>
    </StrictMode>,
);
